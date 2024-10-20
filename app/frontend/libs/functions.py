import os
import boto3
from datetime import datetime
import urllib.parse

# Environment variables configuration
BUCKET_NAME = os.getenv("S3_BUCKET_NAME")
DYNAMODB_TABLE_NAME = os.getenv("DYNAMODB_TABLE_NAME")
SQS_QUEUE_URL = os.getenv("SQS_QUEUE_URL")  # Add this environment variable

# Raise an exception if the bucket name is not set
if BUCKET_NAME is None:
    raise ValueError("S3_BUCKET_NAME environment variable is not set.")
if DYNAMODB_TABLE_NAME is None:
    raise ValueError("DYNAMODB_TABLE_NAME environment variable is not set.")
if SQS_QUEUE_URL is None:
    raise ValueError("SQS_QUEUE_URL environment variable is not set.")

s3_client = boto3.client('s3')
sqs_client = boto3.client('sqs')
dynamodb_client = boto3.resource('dynamodb')
table = dynamodb_client.Table(DYNAMODB_TABLE_NAME)

# Get the current AWS region
session = boto3.Session()
current_region = session.region_name

def upload_image_to_s3(image_data, image_name):
    """Upload image to S3."""

    try:
        s3_client.put_object(
            Bucket=BUCKET_NAME,
            Key=image_name,
            Body=image_data,
            ContentType='image/jpeg'  # Adjust if using other formats
        )

        encoded_image_key = urllib.parse.quote(image_name)
        s3_url = f"https://{current_region}.console.aws.amazon.com/s3/object/{BUCKET_NAME}?region={current_region}&bucketType=general&prefix={encoded_image_key}"
        return f"Image uploaded to S3 as {image_name}. S3 URL: {s3_url}"
    except Exception as e:
        return f"Error uploading image: {e}"

def write_image_metadata_to_dynamodb(metadata):
    """Write image metadata to DynamoDB."""
    print('metadata', metadata)
    
    now = datetime.now()
    # Convert to ISO 8601 format
    iso_string = now.isoformat() + 'Z'  # Append 'Z' to indicate UTC time

    try:
        table.put_item(
            Item={
                'pk': metadata['id'],
                'sk': metadata['email'],
                'image_key': metadata['s3_key'],
                'theme': metadata['theme'],
                'created': iso_string
            }
        )
        encoded_pk = urllib.parse.quote(metadata['id'])
        encoded_sk = urllib.parse.quote(metadata['email']);
        item_url = f"https://{current_region}.console.aws.amazon.com/dynamodbv2/home?region={current_region}#edit-item?itemMode=2&pk={encoded_pk}&route=ROUTE_ITEM_EXPLORER&sk={encoded_sk}&table={DYNAMODB_TABLE_NAME}"
        return f"Metadata for {metadata['s3_key']} written to DynamoDB. Item URL: {item_url}"
    except Exception as e:
        return f"Error writing metadata to DynamoDB: {e}"

def publish_message_to_sqs(message_body):
    """Publish a message to SQS."""
    try:
        response = sqs_client.send_message(
            QueueUrl=SQS_QUEUE_URL,
            MessageBody=message_body
        )
        return f"Message sent to SQS: {response['MessageId']}"
    except Exception as e:
        return f"Error sending message to SQS: {e}"