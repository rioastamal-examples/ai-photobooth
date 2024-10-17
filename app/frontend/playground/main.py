import streamlit as st

# Title of the app
st.title("Image Gallery")

# Create three columns
col1, col2, col3 = st.columns(3)

# Image paths and names
images = [
    ("assets/template/surfer.png", "Surfer"),
    ("assets/template/movie-poster.png", "Moview Poster"),
    ("assets/template/urban-style.png", "Urban"),
]

# Adding images to columns
for i, (img_path, img_name) in enumerate(images):
    with [col1, col2, col3][i]:
        if st.button(img_name):
            st.session_state.selected_image = img_name
            st.session_state.selected_image_path = img_path
            st.switch_page("pages/details.py")
        st.image(img_path, caption=img_name, use_column_width=True)
