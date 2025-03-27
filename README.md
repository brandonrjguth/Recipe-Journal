# Recipe Journal: A Personalized Recipe Manager

## Overview
Recipe Journal is a comprehensive web application designed to help users manage and discover new recipes. It integrates features like recipe scraping from URLs, image-based recipe storage, shopping list generation, favorites management, and a robust search engine.

## Features
- **Recipe Scraping**: Automatically extracts ingredients, instructions, and images from recipe URLs.
- **Image-Based Recipes**: Store recipes as images for quick reference.
- **Manual Recipe Creation**: Add your own recipes manually, adding a description, image, ingredients and steps.
- **Shopping List Generator**: Easily create shopping lists by selecting recipes.
- **Favorites Management**: Mark and view your favorite recipes.
- **Search Engine**: Find recipes by ingredient or name.

## Technologies Used
- **Frontend**: HTML, CSS, JavaScript (with Flexbox for responsive design)
- **Backend**: Node.js with Express
- **Database**: MongoDB
- **Scraping**: Implemented using a self-modified forked version of "https://github.com/jadkins89/Recipe-Scraper"

## How to Run
1. Clone the repository
2. Install the Dependencies
3. Create a dot env file with a mongo uri assigned to the variable "URI"
4. Npm start

Or view a live version for testing at:
