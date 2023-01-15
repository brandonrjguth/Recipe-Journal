//Requires
const express = require("express");
const ejs = require("ejs");
const bodyParser = require('body-parser');

//Express App and Port
const app = express()
const port = 3000;

//Set express to use body parser and ejs
//allows express to access and serve static files like the css from the folder called 'public'
app.use(express.static('public'));
app.use(bodyParser.urlencoded({ extended: true }));

//Express will use ejs templates stored in 'views' folder
app.set('view engine', 'ejs');



//Live Reload setup for live editing and browser refreshing
var livereload = require("livereload");
var connectLiveReload = require("connect-livereload");
const liveReloadServer = livereload.createServer();
liveReloadServer.server.once("connection", () => {
  setTimeout(() => {
    liveReloadServer.refresh("/");
  }, 100);
});
app.use(connectLiveReload());


//Mongo Atlas Connection
const { MongoClient, ServerApiVersion } = require('mongodb');
const uri = "***REMOVED***";
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });
client.connect(err => {

  //Connected to DB, App logic contained within
  console.log("Connected successfully to server");

  //Create Database and Collection
  const db = client.db('recipeBook');
  const recipes = db.collection('recipes');




  //GET ROUTES
  app.get('/', (req, res) => {
    res.render('index')
  })

  app.get('/newRecipePage', (req, res) => {
    res.render('newRecipe', {recipeExists: false})
  })

  //send array of all recipes in collection to recipeList page
  app.get('/recipeList', (req, res) => {
    recipes.find().toArray((err, recipeList) => {
    res.render('recipeList', {recipeList:recipeList})
    });
  })

  //When a recipe url is entered, find the recipe and send the recipe information
  //to be displayed on the recipe page
  app.get("/recipe/:recipeURL", (req, res) => {
    recipes.find({recipeURL:req.params.recipeURL}).toArray((err, fullRecipe) => {
      res.render("recipe", {recipe:fullRecipe});
      });

  })

  //POST ROUTES
  app.post('/newRecipe', function(req, res) {
    
    //Take the title, and replace all spaces with underscores, remove punctuation.
    //This will be used as a human readable url for the recipe
    let recipeURL = req.body.title.replace(/[^a-zA-Z\s]/g, "").replace(/\s/, "_");

    //Redirect back to page with error message if this recipe name already exists
    recipes.find({recipeURL:recipeURL}).toArray(function(err, result){
      
      
      if (result[0] !== undefined){

        console.log("duplicate");
        res.render("newRecipe", {recipeExists: true})
        return

      } 
        /*Initiate empty steps and ingredients array, then make an array out of all key/value pairs from
        the recieved recipe form so that they can be itterated through. Iterate through all keys to find all of the 
        steps and ingredients in the recipe and then add the value pair into the steps and ingredients arrays*/

        let steps = [];
        let ingredients = [];
        let keysArray = Object.keys(req.body);
        let valuesArray = Object.values(req.body);
        let favourite = false;

        for (i = 0; i < keysArray.length; i++){
          if (keysArray[i].includes("step")){
            steps.push(valuesArray[i]);
          }

          if (keysArray[i].includes("ingredient")){
            ingredients.push(valuesArray[i]);
          }
        }

        if (req.body.favourite == "on"){
          favourite = true;
        }

        //Add the recipe into the recipe collection on mongoDB
        recipes.insertOne({
          title: req.body.title,
          recipeURL: recipeURL,
          imageUrl: req.body.image,
          description: req.body.description,
          steps: steps,
          ingredients:ingredients,
          favourite:favourite
        })

        //redirect to new recipes page, with a short wait for the database to have time to fill it
        setTimeout(function(){res.redirect("/recipe/"+ recipeURL)}, 2000)
    
    })
  })


  //find recipe by recieved URL, if its not a favourite, make it one, else remove it from favourites
  app.post('/favouriteRecipe', function(req, res) {
    recipes.find({recipeURL:req.body.recipeURL}).toArray((err, recipe) => {
      if (recipe[0].favourite === false){
        recipes.updateOne({recipeURL:req.body.recipeURL}, { $set: {"favourite":true}})
      } else {
        recipes.updateOne({recipeURL:req.body.recipeURL}, { $set: {"favourite":false}})
      }
      res.render("recipe", {recipe:recipe});
    });
  });

  //edit recipe page
  app.get('/recipe/:recipeURL/editRecipe', function(req, res) {
    recipes.find({recipeURL:req.params.recipeURL}).toArray((err, recipe) => {
      res.render("editRecipe", {recipe:recipe, recipeExists:false});
    });
  });

  //find recipe and delete it entirely
  app.post('/deleteRecipe', function(req, res) {
    recipes.deleteOne({recipeURL:req.body.recipeURL})
    res.redirect("/recipeList");
  });
  
  //Initiate Express listening on port
  app.listen(port, () => {
    console.log(`Example app listening on port ${port}`)
  })

});
