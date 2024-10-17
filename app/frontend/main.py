import streamlit as st

# Title of the app
st.title("AI Photobooth Demo")

if 'selected_image' in st.session_state:
    del st.session_state.selected_image
if 'selected_image_path' in st.session_state:
    del st.session_state.selected_image_path

# Create three columns
col1, col2, col3 = st.columns(3)

# Image paths and names
images = [
    ("assets/template/surfer.png", "Surfer"),
    ("assets/template/mission-not-impossible.png", "Movie Poster"),
    ("assets/template/urban-style.png", "Urban"),
]

# Adding images to columns
for i, (img_path, img_name) in enumerate(images):
    with [col1, col2, col3][i]:
        st.header(img_name)
        st.image(img_path, use_column_width=True)
        if st.button("Generate", key=img_name):
            st.session_state.selected_image = img_name
            st.session_state.selected_image_path = img_path
            st.switch_page("pages/camera.py")