_(This document is still work in progress)_

This project sets up an AI photobooth system, leveraging AWS services including EC2, Lambda, S3, DynamoDB, and SQS. It deploys a machine learning model for generating images based on user input.

## Project Structure

```
.
├── app
│   ├── api
│   └── frontend
└── iac
    ├── ai-photobooth.yaml  # CloudFormation template
    ├── functions.sh        # Helper functions for stack operations
    └── user-data.sh        # Startup script for the EC2 instance
```

## Prerequisites
- AWS CLI installed and configured with appropriate IAM permissions.
- An existing EC2 Key Pair (EC2_KEY_PAIR_NAME environment variable).
- The EMAIL_FROM environment variable, containing the email address for sending notifications.

## Environment Variables

Ensure the following environment variables are set:

- `EC2_KEY_PAIR_NAME` – Your EC2 Key Pair for SSH access.
- `EMAIL_FROM` – The email address to send notifications from.

## AWS Resources Deployed

- EC2 Instance: Runs the Stable Diffusion WebUI API.
- S3 Bucket: Stores images and assets.
- DynamoDB Table: Manages metadata for image requests.
- SQS Queue: Manages requests for the Lambda function.
- Lambda Function: Processes image requests and interfaces with S3 and DynamoDB.
- Security Group: Controls SSH and HTTP access to the EC2 instance.

## How to Deploy the CloudFormation Stack

Get all the helper functions first.

```sh
source
```


### Create a Stack:

To create a new CloudFormation stack, run the following command:

```sh
create_stack stack-name
```

This command appends a random suffix to the stack-name to ensure uniqueness.

### Monitor Stack Creation:

Run the following command to monitor the status of the stack creation:

```sh
list_stacks_active
```

Once the status of the stack is `CREATE_COMPLETE`, note down the full stack name with the appended suffix (e.g., `stack-name-123abc`).

### Update the Lambda Function:

After the stack is created, update the Lambda function by passing the full stack name with the suffix:

```sh
update_lambda_function stack-name-123abc
```

### Run the Stable Diffusion WebUI API:

To start the Stable Diffusion WebUI API on the EC2 instance:

```sh
run_sdxl_webui_api stack-name-123abc
```

This command may take some time during the initial run as it installs necessary packages. You might need to restart the server once the setup completes.

### Get the Public IP of the EC2 Instance:

If you need to access the instance directly, retrieve its public IP address with:

```sh
get_instance_public_ip stack-name-123abc
```

## Running the Frontend (Streamlit)

The frontend is built using Streamlit. To run it, you must first set up environment variables. The .env.example file contains the required variables:

### Example .env Setup

Create a .env file in your project root directory and populate it with the following variables (using actual values from your stack):

```sh
export AWS_DEFAULT_REGION=your-region
export S3_BUCKET_NAME=your-s3-bucket-name
export DYNAMODB_TABLE_NAME=your-dynamodb-table-name
export SQS_QUEUE_URL=your-sqs-queue-url
export USER_EMAIL_DEMO=email-send-to@example.com
```

You can also use the provided .env.example file as a template.

### Install Python Dependencies
Make sure to install the necessary dependencies. Run:

```sh
pip install -r app/frontend/requirements.txt
```

### Run the Streamlit App

To start the frontend application, navigate to the app/frontend directory and run:

```
streamlit run main.py --server.port 8080
```

This will launch the Streamlit frontend on port 8080, allowing users to interact with the AI photobooth system.

## Managing the Stack

### List All Stacks:

To list all CloudFormation stacks, including deleted ones:

```sh
list_stacks
```

### List Active Stacks:

To view only active stacks:

```sh
list_stacks_active
```

### Delete a Stack:

To delete a stack (and clean up associated resources like S3 objects):

```sh
delete_stack stack-name-123abc
```

### Notes:
The stack name passed during creation will automatically get a random suffix for uniqueness. Be sure to run `list_stacks_active` to retrieve the full name before further actions.