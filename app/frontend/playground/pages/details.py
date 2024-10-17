import streamlit as st

# Check if an image is selected
if 'selected_image' in st.session_state:
    selected_image = st.session_state.selected_image
    selected_image_path = st.session_state.selected_image_path
    
    # Title of the details page
    st.title("Image Details")
    st.header(selected_image)
    
    # Display the image
    st.image(selected_image_path, caption=selected_image, use_column_width=True)
    
    # Back button to return to main.py
    if st.button("Back to Gallery"):
        del st.session_state.selected_image
        del st.session_state.selected_image_path
        st.switch_page("main.py")
else:
    st.error("No image selected. Please go back to the gallery.")
