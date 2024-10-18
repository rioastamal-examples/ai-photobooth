#!/bin/bash

# Script to install and run Stable Diffusion WebUI Forge with following settings
# - Model: JuggernautXL V8+RunDiffusion
# - Extension: ReActor

sudo -u ubuntu bash << 'EOF'

# Go to the home directory
cd /home/ubuntu

[ ! -d stable-diffusion-webui-forge ] && {
    sudo apt-get update -y
    sudo apt-get install -y python3.10 python3.10-venv libgl1 libglib2.0-0 aria2
    
    git clone https://github.com/lllyasviel/stable-diffusion-webui-forge.git
}

cd stable-diffusion-webui-forge

# Download JuggernautXL V8+RunDiffusion
[ ! -f models/Stable-diffusion/juggernautXL_v8Rundiffusion.safetensors ] && {
    aria2c -x 4 -s 4 -o models/Stable-diffusion/juggernautXL_v8Rundiffusion.safetensors 'https://civitai.com/api/download/models/288982?type=Model&format=SafeTensor&size=full&fp=fp16'
}

# Create Python3.10 venv
python3.10 -m venv venv
source venv/bin/activate
    
# Download reActor extension
[ ! -d extensions/sd-webui-reactor ] && {
    git clone https://github.com/Gourieff/sd-webui-reactor.git extensions/sd-webui-reactor
    pip install -r extensions/sd-webui-reactor/requirements.txt
}

# Run the API
export python_cmd=python3.10
bash webui.sh --listen --port 8080
EOF