"use strict";

const BaseScraper = require("../helpers/BaseScraper");

function titleCase(str) {
    return str.toLowerCase().replace(/(^|\s)\S/g, (t) => t.toUpperCase());
  }

/**
 * Class for scraping cookieandkate.com
 * @extends BaseScraper
 */
class TamingTwinsScraper extends BaseScraper {
  constructor(url) {
    super(url, "tamingtwins.com/");
  }

  scrape($) {
    this.defaultSetImage($);
    this.defaultSetDescription($);
    const { ingredients, instructions, tags, time } = this.recipe;
    this.recipe.name = titleCase($("h1")
      .text().replace(/\s*{[^}]*}\s*/g, ''));


    $(".wprm-recipe-ingredient-name")
      .each((i, el) => {
        ingredients.push($(el).text());
      });

    $(".wprm-recipe-instruction-text")
      .find("span")
      .each((i, el) => {
        instructions.push($(el).text());
      });
  }
}

module.exports = TamingTwinsScraper;
