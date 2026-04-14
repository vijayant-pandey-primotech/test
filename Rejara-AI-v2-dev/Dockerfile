FROM python:3.10.14
WORKDIR /usr/app

EXPOSE 5000
ENV LANG en_US.UTF-8
ENV LC_ALL en_US.UTF-8

COPY requirements.txt .
RUN pip3 install -r requirements.txt
# COPY install_nltk_requirements_for_developer_mode.py .
# RUN python3 install_nltk_requirements_for_developer_mode.py

COPY . .
CMD [ "python3", "app.py" ]


