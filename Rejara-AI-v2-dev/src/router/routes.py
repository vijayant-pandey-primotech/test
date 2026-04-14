import flask
from src.router.router_helper import *

# Define the Flask Blueprint for the chatbot routes
cbot_routes = flask.Blueprint("cbot_routes", __name__)


# Chatbot API endpoint
@cbot_routes.route("/cbot", methods=["POST"])
def chat_handler():
    return chat_handler_helper()
    

# Migrate data from Torch to rejara
@cbot_routes.route("/migrate", methods=["POST"])
def generate_data():
    return generate_data_helper()


# Create story api
@cbot_routes.route("/create-story", methods=["POST"])
def create_story():
    return create_story_helper()


# Migrate data from Torch to rejara for source script
@cbot_routes.route("/source-script", methods=["POST"])
def generate_data2():
    return generate_data2_helper()