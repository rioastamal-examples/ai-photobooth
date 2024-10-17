get_default_vpc_id() {
  aws ec2 describe-vpcs --filters "Name=isDefault,Values=true" --query "Vpcs[0].VpcId" --output text
}

get_stack_output() {
  local STACK_NAME="$1"
  aws cloudformation describe-stacks --stack-name $STACK_NAME --query "Stacks[0].Outputs" --output text
}

get_instance_public_ip() {
  local STACK_NAME="$1"
  local INSTANCE_ID="$( get_stack_output $STACK_NAME | grep InstanceId | awk '{print $NF}')"
  aws ec2 describe-instances --instance-ids $INSTANCE_ID --query "Reservations[*].Instances[0].PublicIpAddress" --output text
}

get_stack_status() {
  local STACK_NAME="$1"
  aws cloudformation describe-stacks --stack-name $STACK_NAME --query "Stacks[0].StackStatus" --output text
}

delete_stack() {
  local STACK_NAME="$1"
  
  # Clean up S3 files
  aws s3 rm s3://$STACK_NAME/ --recursive
  aws cloudformation delete-stack --stack-name $STACK_NAME
}

list_stacks() {
  aws cloudformation list-stacks --query "StackSummaries[*].[StackName, StackStatus]" --output text | awk 'BEGIN { printf "%-40s %-25s\n", "NAME", "STATUS" } { printf "%-40s %-25s\n", $1, $2 }'
}

list_stacks_active() {
  list_stacks | grep -v 'DELETE_COMPLETE'
}

create_stack() {
  [ -z "$EC2_KEY_PAIR_NAME" ] && {
    printf "Missing %s env.\n" "EC2_KEY_PAIR_NAME" >&2
    return 1
  }

  [ -z "$EMAIL_FROM" ] && {
    printf "Missing %s env.\n" "EMAIL_FROM" >&2
    return 1
  }
  
  local STACK_NAME="$1"
  [ -z "$STACK_NAME" ] && {
    printf "Missing 1st arg: Stack name" >&2
    return 1
  }
  
  local KEY_NAME=$EC2_KEY_PAIR_NAME
  local EMAIL=$EMAIL_FROM
  local RANDOM_SUFFIX="$( openssl rand -hex 6 )"

  [ -z "$EC2_VPC_ID" ] && local VPC_ID="$( get_default_vpc_id )"

  aws cloudformation create-stack --stack-name $STACK_NAME-$RANDOM_SUFFIX \
    --template-body file://iac/ai-photobooth.yaml \
    --capabilities CAPABILITY_IAM \
    --parameters ParameterKey=KeyName,ParameterValue=$KEY_NAME \
                 ParameterKey=VPCId,ParameterValue=$VPC_ID \
                 ParameterKey=EmailFrom,ParameterValue="$EMAIL"

  printf "
-> Run following command to monitor the status of the stack:

    get_stack_status $STACK_NAME-$RANDOM_SUFFIX
    - or
    list_stacks
    - or
    list_stacks_active
"
}

update_stack() {
  [ -z "$EC2_KEY_PAIR_NAME" ] && {
    printf "Missing %s env.\n" "EC2_KEY_PAIR_NAME" >&2
    return 1
  }
  
  [ -z "$EMAIL_FROM" ] && {
    printf "Missing %s env.\n" "EMAIL_FROM" >&2
    return 1
  }
  
  local KEY_NAME=$EC2_KEY_PAIR_NAME
  local EMAIL=$EMAIL_FROM
  local STACK_NAME="$1"
  
  [ -z "$STACK_NAME" ] && {
    printf "Missing 1st arg: Stack name" >&2
    return 1
  }

  [ -z "$EC2_VPC_ID" ] && local VPC_ID="$( get_default_vpc_id )"

  aws cloudformation update-stack --stack-name $STACK_NAME \
    --template-body file://iac/ai-photobooth.yaml \
    --capabilities CAPABILITY_IAM \
    --parameters ParameterKey=KeyName,ParameterValue=$KEY_NAME \
                 ParameterKey=VPCId,ParameterValue=$VPC_ID \
                 ParameterKey=EmailFrom,ParameterValue="$EMAIL"
                 
  printf "
-> Run following command to monitor the status of the stack:

    get_stack_status $STACK_NAME-$RANDOM_SUFFIX
    - or
    list_stacks
    - or
    list_stacks_active
"
}

update_lambda_function() {
  [ ! -f app/api/index.js ] && {
    printf "Missing file app/api/index.js. Make sure running this function from project root directory.\n" >&2
    return 1
  }
  
  local FUNC_NAME="$1"
  
  [ -z "$FUNC_NAME" ] && {
    printf "Missing 1st arg - the function name.\n" >&2
    return 1
  }
  
  mkdir -p .tmp && rm -rf .tmp/* 2>/dev/null >/dev/null
  cd app/api && \
  zip -r ../../.tmp/function.zip index.js templates && \
  cd ../..
  
  printf "\n-> Updating Lambda code...\n"
  aws lambda update-function-code \
    --function-name "$FUNC_NAME" \
    --zip-file fileb://.tmp/function.zip >/dev/null

  local API_HOST="$( get_instance_public_ip $FUNC_NAME )"
  printf "\n-> Updating environment variables...\n"
  aws lambda get-function-configuration \
    --function-name "$FUNC_NAME" \
    --query 'Environment.Variables' --output json | \
      jq ". + {\"SDXL_API_HOST\": \"$API_HOST\"}" | \
      jq '{Variables: .}' | \
        aws lambda update-function-configuration \
          --function-name "$FUNC_NAME" --environment file://<(cat)

}