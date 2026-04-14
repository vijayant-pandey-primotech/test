# Rejara-AI:
1. Rejara Ai Repo => `https://github.com/karthicbala/Rejara-AI.git`

# Environment Setup:
1. Download Python 3.11.2 [Here](https://www.python.org/downloads/release/python-3114/)
2. Verify the installation by running:
    - Windows: `python --version` 
    - MacOS/Linux `python3 --version`
3. Create a virtual environment by running `python -m venv rejaravenv`
4. Activate the virtual environment by running:
    - Windows: `rejaravenv/Scripts/activate` or in bash command : `source rejaravenv/Scripts/activate`
    - MacOS/Linux: `source rejaravenv/bin/activate`
5. Update pip by running `python -m pip install --upgrade pip`
6. Run `pip install -r requirements.txt`
7. IF not found the `requirements.txt` just do `pip freeze > requirements.txt` then run the 6th command 
8. Run the project:
    - Windows: `python app.py` or `flask run --host=0.0.0.0 --port=5000`
    - MacOS/Linux: `python-3 app.py` or `flask run --host=0.0.0.0 --port=5000`
9. Once you're done working, deactivate the virtual environment by running `deactivate`

# . Env Credentaiils:
1. Refer the `env.example.txt` file
2. Create the .env file in root directory

# Firestore connection:
1. Get the `Service.key.json` file to connect with the firestore

# Redis server:
1. Connect with the redis client server with the local or prod based enviroment ref : `env.example.txt`

# Folder Structure Explain:
1. **config**
   - **Purpose**: This folder is used to store configuration settings and environment-specific variables for your application. It allows for easy management of settings (like database URLs, secret keys, or third-party API keys) that can differ between development, testing, and production environments.
   
2. **controller**
   - **Purpose**: This folder usually contains the application's route handlers or "controllers" that respond to HTTP requests. In Flask, controllers are typically functions or methods that are mapped to routes and handle the logic for processing requests.

3. **middleware**
   - **Purpose**: Middleware is a layer of code that sits between the request and response. It's used to modify or check incoming requests before they are passed to the controller or after the controller has processed the request but before the response is sent back to the client.

4. **router**
   - **Purpose**: This folder organizes the routing part of the application. It typically holds the logic to define and organize different routes for the application. In some cases, it can be used to organize routes into groups, such as routes related to different parts of the app (users, products, etc.).

5. **utils**
   - **Purpose**: This folder is used for utility functions and helper modules that don't belong to any specific feature of the app. These could be things like string formatting, date utilities, or data transformation functions.

6. **services**
   - **Purpose**: The services folder contains business logic and service-level code that is often called by controllers to perform more complex operations, like interacting with databases or external APIs. This keeps the controller layer lean and focused on HTTP request/response logic.

7. **.gitignore**
   - **Purpose**: This file tells Git which files or directories should not be tracked in version control. It's typically used to exclude files like temporary files, virtual environments, or compiled code that do not need to be committed to the repository.

8. **.env**
   - **Purpose**: This file contains environment variables, like secret keys, database URLs, and other sensitive information. It helps to keep configuration separate from the code and allows you to easily switch between different environments (development, production, etc.) by simply changing the `.env` file.

9. **firestore (serviceskey.json)**
   - **Purpose**: This file is usually a service account key file for Firebase (Firestore in this case), which is required for authenticating and interacting with Firebase services. It typically contains the credentials required to interact with Firestore or any other Firebase services.

10. **requirements.txt**
   - **Purpose**: This file lists all of the Python dependencies (libraries or packages) required for your project. It allows you to easily install all the necessary packages in a new environment using the `pip install -r requirements.txt` command.

### Summary
These files and folders provide a well-structured way to manage the Flask project, helping to maintain clear separation of concerns, improving scalability, and making it easier to maintain and test the application as it grows. Proper organization and configuration management are key to a production-ready application.