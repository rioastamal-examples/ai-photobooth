import streamlit as st
from PIL import Image
import uuid
import os
from libs.functions import upload_image_to_s3
from libs.functions import write_image_metadata_to_dynamodb
from libs.functions import publish_message_to_sqs
from datetime import datetime

# Hardcoded user email, for real-world use case it should be taken 
# from user input
user_email = os.getenv('USER_EMAIL_DEMO')

if user_email is None:
    raise ValueError("USER_EMAIL_DEMO environment variable is not set.")

if 'selected_image' not in st.session_state:
    st.switch_page("main.py")

theme = st.session_state.selected_image

# Camera input
st.header("Get ready!")
image = st.camera_input(f"Theme: {theme}")

if image:
    # Display the captured image
    # st.image(image, caption="Captured Image", use_column_width=True)
    
    # Check the image format using Pillow
    image_pil = Image.open(image)
    image_format = image_pil.format  # This will be 'JPEG' for most cases
    st.write(f"Image format: {image_format}")
    
    now = datetime.now()
    year_month_prefix = f"{now.year}/{now.month:02d}"  # Format as YYYY/MM

    # Generate a unique name for the image
    image_uuid = str(uuid.uuid4())
    image_name = f"user-photos/{year_month_prefix}/{user_email}-{image_uuid}.{image_format.lower()}"  # Use the actual format for naming
    
    upload_image_is_ok = False
    write_to_db_is_ok = False
    publish_queue_is_ok = False
        
    # Option to upload to S3
    # reset pointer of the image
    image.seek(0)
    
    upload_message = upload_image_to_s3(image, image_name)
    if "Error" not in upload_message:
        upload_image_is_ok = True
        st.success(upload_message)  # Display the upload status
        
    if "Error" in upload_message:
        st.error(upload_message)

    # Option to upload to DynamoDB table
    metadata_id = f"{image_uuid}#{user_email}"
    if upload_image_is_ok:
        image_metadata = {
            "id": metadata_id,
            "s3_key": image_name,
            "theme": theme,
            "email": user_email
        }
        metadata_message = write_image_metadata_to_dynamodb(image_metadata)
        
        if "Error" not in metadata_message:
            write_to_db_is_ok = True
            st.success(metadata_message)  # Display the put item status
        
        if "Error" in metadata_message:
            st.error(metadata_message)
        
    # Option to publish to SQS queue
    if write_to_db_is_ok:
        sqs_response = publish_message_to_sqs(metadata_id)
        
        if "Error" not in sqs_response:
            publish_queue_is_ok = True
            st.success(sqs_response)

    del st.session_state.selected_image
    del st.session_state.selected_image_path