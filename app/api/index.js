// Content of this file is duplicated at iac/ai-photobooth.yaml
// Import necessary AWS SDK clients
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3");
const { GetCommand, DynamoDBDocumentClient } = require("@aws-sdk/lib-dynamodb");
const { SESClient, SendRawEmailCommand } = require("@aws-sdk/client-ses");
const { SQSClient, DeleteMessageCommand } = require("@aws-sdk/client-sqs");
const { Buffer } = require('buffer');
const fs = require('fs');
const http = require('http');

// Initialize DynamoDB, S3, and SES clients
const dynamoDbClient = new DynamoDBClient();
const docClient = DynamoDBDocumentClient.from(dynamoDbClient);
const s3Client = new S3Client();
const sesClient = new SESClient();
const sqsClient = new SQSClient();

// Environment variables
const DYNAMODB_TABLE_NAME = process.env.DYNAMODB_TABLE_NAME;
const BUCKET_NAME = process.env.S3_BUCKET_NAME;
const SQS_QUEUE_URL = process.env.SQS_QUEUE_URL;
const EMAIL_FROM = process.env.EMAIL_FROM;
const DELETE_SQS_QUEUE = process.env.DELETE_SQS_QUEUE || 'no';
const SDXL_API_HOST = process.env.SDXL_API_HOST || '127.0.0.1';
const SDXL_API_PORT = process.env.SDXL_API_PORT || 8080;

// Required environment variables
const requiredEnvVars = [
    'DYNAMODB_TABLE_NAME', 'S3_BUCKET_NAME', 'EMAIL_FROM', 'SQS_QUEUE_URL', 'SDXL_API_HOST'
];

// Check for required environment variables
let missingVars = [];
requiredEnvVars.forEach((varName) => {
    if (!process.env[varName]) {
        missingVars.push(varName);
    }
});

if (missingVars.length > 0) {
    console.error(`Error: Missing environment variables: ${missingVars.join(', ')}`);
    process.exit(1); // Exit the Lambda function with an error code
}

const main = async (event) => {
    for (const record of event.Records) {
        const imageId = record.body; // Assume the image ID is the message body
        
        try {
            // Fetch metadata from DynamoDB
            const metadata = await getMetadata(imageId);
            console.log('metadata =>', metadata);

            if (!metadata) {
                console.log(`No metadata found for image ID: ${imageId}`);
                continue;
            }

            // Fetch the image from S3 and turn the image to Base64 
            // data with prefix e.g data:image/jpeg;base64,BASE64_DATA
            const imageSourceBuffer = await getImageFromS3(metadata.image_key);
            const imageSourceBase64Data = convertImageBufferToBase64(imageSourceBuffer, metadata.image_key);
            console.log(`Fetched image from S3: ${metadata.image_key}`);
            
            // Get the target image template and convert to Base64 data with prefix
            const targetFilename = themeToFile(metadata.theme);
            const imageTargetBase64Data = fileToBase64(targetFilename);
            const finalImageBase64 = await callSwapFaceApi(imageSourceBase64Data, imageTargetBase64Data);

            // Send the image via email
            const fileName = metadata.image_key.split('/').pop();
            await sendEmailWithImage(fileName, finalImageBase64, metadata.sk);
            
            // Delete queue
            if (DELETE_SQS_QUEUE === 'yes') {
                const receiptHandle = record.receiptHandle;
                await deleteMessageFromSQS(receiptHandle);
            }
        } catch (error) {
            console.error(`Error processing SQS message: ${error.message}`);
        }
    }
};

const getMetadata = async (imageId) => {
    const email = imageId.split('#').pop();
    const params = {
        TableName: DYNAMODB_TABLE_NAME,
        Key: {
            pk: imageId,
            sk: email
        }
    };
    
    try {
        const command = new GetCommand(params);
        const result = await docClient.send(command);
        
        return result.Item;
    } catch (error) {
        console.error(`Error fetching metadata from DynamoDB: ${error.message}`);
        throw error;
    }
};

const getImageFromS3 = async (object_key) => {
    const params = {
        Bucket: BUCKET_NAME,
        Key: object_key
    };

    try {
        const command = new GetObjectCommand(params);
        const data = await s3Client.send(command);
        return await streamToBuffer(data.Body); // Convert stream to buffer
    } catch (error) {
        console.error(`Error fetching image from S3: ${error.message}`);
        throw error;
    }
};

// Helper function to convert a ReadableStream to a Buffer
const streamToBuffer = async (stream) => {
    const chunks = [];
    for await (const chunk of stream) {
        chunks.push(chunk);
    }
    return Buffer.concat(chunks); // Return the buffer
};

const convertImageBufferToBase64 = (imageBuffer, key) => {
    // Determine the image format based on the key (file name)
    const imageFormat = getImageFormat(key);
    // Convert the buffer to Base64 and format as a data URL
    return `data:${imageFormat};base64,${imageBuffer.toString('base64')}`;
};

// Function to convert image file to base64
function fileToBase64(file) {
    const data = fs.readFileSync(file);
    const mimeType = file.endsWith('.png') ? 'image/png' : 'image/jpeg';
    return `data:${mimeType};base64,${data.toString('base64')}`;
}

function themeToFile(theme) {
    const files = {
        'Surfer': 'templates/surfer.png',
        'Movie Poster': 'templates/mission-not-impossible.png',
        'Urban': 'templates/urban-style.png'
    };
    
    if (files.hasOwnProperty(theme) === false) {
        throw new Error(`Unsupported theme: ${theme}`);
    }
    
    return files[theme];
}

async function callSwapFaceApi(sourceImageBase64, targetImageBase64) {
    // Prepare the data to send
    const data = JSON.stringify({
        source_image: sourceImageBase64,
        target_image: targetImageBase64,
        "upscaler": "None",
        device: "CUDA",
        scale: 1,
        "upscale_visibility": 1,
        "face_restorer": "CodeFormer",
        "restorer_visibility": 1,
        "codeformer_weight": 0.8,
        "restore_first": 1,
        "model": "inswapper_128.onnx",
        "gender_source": 0,
        "gender_target": 0,
        "save_to_file": 0,
        "random_image": 1,
        "upscale_force": 1
    });

    // Options for the HTTP request
    const options = {
        hostname: SDXL_API_HOST,
        port: SDXL_API_PORT,
        path: '/reactor/image',
        method: 'POST',
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(data),
        },
    };

    return new Promise(function(resolve, reject) {
        // Make the POST request
        const req = http.request(options, (res) => {
            let responseData = '';
    
            // Log status code and headers
            console.log('Status Code:', res.statusCode);
            console.log('Headers:', JSON.stringify(res.headers, null, 2));
    
            // Collect response data
            res.on('data', (chunk) => {
                responseData += chunk;
            });
    
            // End of response
            res.on('end', () => {
                try {
                    const jsonResponse = JSON.parse(responseData);
                    
                    // Assuming the base64 image data is under the 'image' property
                    if (jsonResponse.image) {
                        const base64Image = jsonResponse.image; // Get the base64 data
                        resolve(base64Image);
                        // const buffer = Buffer.from(base64Image, 'base64');
                        // fs.writeFileSync('output_image.png', buffer); // Write to a file
                        console.log('Image has been fetched.');
                    } else {
                        console.log('No image returned in the response.');
                        reject(new Error('No image returned in the response.'));
                    }
                } catch (error) {
                    console.error('Error parsing response:', error);
                }
            });
        });
    
        // Handle errors
        req.on('error', (error) => {
            console.error('Error:', error);
        });
    
        // Write data to request body
        req.write(data);
        req.end();
    });
}

// Helper function to determine the image format
const getImageFormat = (key) => {
    const extension = key.split('.').pop().toLowerCase();
    switch (extension) {
        case 'jpg':
        case 'jpeg':
            return 'image/jpeg';
        case 'png':
            return 'image/png';
        case 'gif':
            return 'image/gif';
        case 'bmp':
            return 'image/bmp';
        case 'svg':
            return 'image/svg+xml';
        default:
            throw new Error(`Unsupported image format: ${extension}`);
    }
};

// Function to send email with image attachment
const sendEmailWithImage = async (imageName, imageData, emailTo) => {
    const boundary = "boundary123";
    const isoDate = new Date().toISOString();
    const subject = `Your AI Image is Ready - ${isoDate}`;
    const emailContent = `Halo,

Terima kasih telah menggunakan AI Photobooth Image Generator. 
Hasil foto dapat kamu download di attachment yang ada di email ini.

Nama file:
${imageName}

Salam,
Tim AI Photobooth
`;

    const emailBody = `
Content-Type: multipart/mixed; boundary="${boundary}"

--${boundary}
Content-Type: text/plain; charset="UTF-8"
Content-Transfer-Encoding: 7bit

${emailContent}

--${boundary}
Content-Type: image/jpeg
Content-Transfer-Encoding: base64
Content-Disposition: attachment; filename="${imageName}"

${imageData.toString('base64')}
--${boundary}--`;

    const rawMessage = `From: ${process.env.EMAIL_FROM}
To: ${emailTo}
Subject: ${subject}
MIME-Version: 1.0
Content-Type: multipart/mixed; boundary="${boundary}"

${emailBody}`;

    const params = {
        RawMessage: {
            Data: Buffer.from(rawMessage)
        },
        Source: EMAIL_FROM,
        Destinations: [
            emailTo
        ],
    };

    try {
        const command = new SendRawEmailCommand(params);
        await sesClient.send(command);
        console.log(`Email sent to ${emailTo} with image ${imageName}`);
    } catch (error) {
        console.error(`Error sending email: ${error.message}`);
        throw error;
    }
};

// Function to delete the message from SQS
const deleteMessageFromSQS = async (receiptHandle) => {
    const params = {
        QueueUrl: SQS_QUEUE_URL,
        ReceiptHandle: receiptHandle,
    };

    try {
        const command = new DeleteMessageCommand(params);
        await sqsClient.send(command);
        console.log(`Message deleted from SQS: ${receiptHandle}`);
    } catch (error) {
        console.error(`Error deleting message from SQS: ${error.message}`);
        throw error;
    }
};

if (process.env.hasOwnProperty('AWS_LAMBDA_FUNCTION_NAME') === false) {
    // Assume running directly from CLI
    const sqsEventData = {
        Records: [
            {
                // Id of the metadata in DynamoDB
                body: process.env.METADATA_ID || '---'
            }
        ]
    };
    
    main(sqsEventData);
}

exports.handler = main;