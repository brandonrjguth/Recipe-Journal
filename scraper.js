
const recipeScraper = require("recipe-scraper");
const url = 'https://www.budgetbytes.com/taco-chicken-bowls/'


recipeScraper(url).then(recipe => {
    console.log(recipe);
  }).catch(error => {
    console.log(error);
  });