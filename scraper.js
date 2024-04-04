const cheerio = require("cheerio");
const axios = require("axios");
const url = "https://chefjonwatts.com/firecracker-beef/#recipe"

async function getRecipe(url){
  try{

    //Get result from page
    let response = await axios.get(url);
    let $ = cheerio.load(response.data)

    //Scrape Title, Ingredients, and Steps
    let title = $(".wprm-recipe-name").text();
    let ingredientsObj = $(".wprm-recipe-ingredient");
    let stepsObj = $(".wprm-recipe-instruction-text");
    let ingredients = []
    let steps = []
    let image = $(".wprm-recipe-image").find("img").attr('src')

    ingredientsObj.each(function() {
      ingredients.push($(this).text());
    });

    stepsObj.each(function() {
      steps.push($(this).text());
    });

    let recipe = {
      title:title,
      ingredients:ingredients,
      steps:steps,
      image, image
    }

    console.log(recipe);

  } catch (err){
    console.log(err);
  }
}

getRecipe(url);