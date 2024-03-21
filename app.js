//Requires
const express = require("express");
const ejs = require("ejs");
const bodyParser = require('body-parser');
require('dotenv').config()
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


console.log(process.env.URI)
//Mongo Atlas Connection
const { MongoClient, ServerApiVersion } = require('mongodb');
const uri = process.env.URI;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });
client.connect(err => {

  //Connected to DB, App logic contained within
  console.log("Connected successfully to server");

  //Create Database and Collection
  const db = client.db('recipeBook');
  const recipes = db.collection('recipes');


  //---------------------------------------------------------------//
  //---------------------GET ROUTES--------------------------------//
  //---------------------------------------------------------------//

  //Root, render homepage
  app.get('/', (req, res) => {
    res.redirect('/recipeList')
  })

  app.get("/favourites", (req,res) =>{
    recipes.find({favourite:true}).sort({"title":1}).toArray((err, recipeList) => {
      res.render('recipeList', {recipeList:recipeList, favourites:true})
      });
  })

  //Render page for creating a new recipe
  app.get('/newRecipePage', (req, res) => {
    res.render('newRecipe', {recipeExists: false})
  })

  //Render page for linking a new recipe
  app.get('/newRecipeLink', (req, res) => {
    res.render('newRecipeLink', {recipeExists: false})
  })


  //Render page for creating a new recipe
  app.get('/recipeFrom', (req, res) => {
    res.render('recipeFrom', {recipeExists: false})
  })

  //send array of all recipes in collection to recipeList page
  app.get('/recipeList', (req, res) => {
    recipes.find().sort({"title":1}).toArray((err, recipeList) => {
    res.render('recipeList', {recipeList:recipeList, favourites:false})
    });
  })

  //When a recipe url is entered, find the recipe and send the recipe information
  //to be displayed on the recipe page
  app.get("/recipe/:recipeTitleShort", (req, res) => {
    console.log(req.params.recipeTitleShort)
    recipes.find({recipeTitleShort:req.params.recipeTitleShort}).toArray((err, fullRecipe) => {
      res.render("recipe", {recipe:fullRecipe});
      });
  })

  //Send user to the editing page for the chosen recipe
  app.get('/recipe/:recipeTitleShort/editRecipe', function(req, res) {
    recipes.find({recipeTitleShort:req.params.recipeTitleShort}).toArray((err, recipe) => {
      res.render("editRecipe", {recipe:recipe, recipeExists:false});
    });
  });

  //---------------------------------------------------------------//
  //---------------------POST ROUTES--------------------------------//
  //---------------------------------------------------------------//

  //Submitted newly created recipe
  app.post('/newRecipe', function(req, res) {
    
    //Take the title, and replace all spaces with underscores, remove punctuation.
    //This will be used as a human readable url for the recipe
    let recipeTitleShort = req.body.title.replace(/[^a-zA-Z\s]/g, "").replace(/\s/, "_");
    let recipeURL = "noURL";

    //Redirect back to page with error message if this recipe name already exists
    recipes.find({recipeURL:recipeURL}).toArray(function(err, result){
      if (result[0] !== undefined){
        console.log("duplicate");
        res.render("newRecipe", {recipeExists: true})
        return
      } 

      /*Initiate empty steps and ingredients array, then make an array out of all key/value pairs from
      the recieved recipe form so that they can be itterated through. Iterate through all keys to find all of the 
      steps and ingredients in the recipe and then add the value pair into the steps and ingredients arrays
      which will be stored in the recipe object and put into the mongo database*/
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

      if (req.body.favourite === "on"){
        favourite = true;
      }

      //Add the recipe into the recipe collection on mongoDB
      recipes.insertOne({
        title: req.body.title,
        recipeTitleShort:recipeTitleShort,
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

    //Submitted newly created recipe
    app.post('/newRecipeLink', function(req, res) {

      let recipeTitleShort = req.body.title.replace(/[^a-zA-Z\s]/g, "").replace(/\s/, "_");
      let recipeURL = req.body.link;

      //Redirect back to page with error message if this recipe name already exists
      recipes.find({recipeURL:recipeURL}).toArray(function(err, result){
        if (result[0] !== undefined){
          console.log("duplicate");
          res.render("newRecipeLink", {recipeExists: true})
          return
        } 
        let favourite = false;
  
        if (req.body.favourite === "on"){
          favourite = true;
        }
  
        //Add the recipe into the recipe collection on mongoDB
        recipes.insertOne({
          title: req.body.title,
          recipeTitleShort:recipeTitleShort,
          recipeURL: recipeURL,
          favourite:favourite,
          isLink:true
        })
  
        //redirect to new recipes page, with a short wait for the database to have time to fill it
        setTimeout(function(){res.redirect("/recipeList")}, 2000)
      })
    })


  //Favourite submission. Find recipe by recieved URL, if its not a favourite, make it one, else remove it from favourites
  app.post('/favouriteRecipe', function(req, res) {

    console.log();
    recipes.find({recipeTitleShort:req.body.recipeTitleShort}).toArray((err, recipe) => {
      if (recipe[0].favourite === false){
        recipes.updateOne({recipeTitleShort:req.body.recipeTitleShort}, { $set: {"favourite":true}})
      } else {
        recipes.updateOne({recipeTitleShort:req.body.recipeTitleShort}, { $set: {"favourite":false}})
      }
    });

    /*find recipe again, otherwise we are sending the orignal object of the recipe we retrieved from mongoDB that doesn't
    have the favourite status changed. Timeout for 1 second before doing this to insure the server has had time to update*/
    setTimeout(function(){
      //req.get('Referrer').includes("recipeList")


      recipes.find({recipeTitleShort:req.body.recipeTitleShort}).toArray((err, recipe) => {

        //redirect based on page the favourite was selected from
        
        if (req.get('Referrer').includes("recipeList")){
          res.redirect("recipeList");
        } else if (req.get('Referrer').includes('favourites')){
          res.redirect("favourites");
        } else {
          res.render("recipe", {recipe:recipe})
        }
      });
    }, 1000)

  });

  /*Edit submission. Repeat the same logic that is used for a new recipe, but this time, find and update the submitted recipe 
  for edditing*/
  app.post("/recipe/:recipeTitleShort/editRecipe", function(req, res){

    let recipeTitleShort = req.body.title.replace(/[^a-zA-Z\s]/g, "").replace(/\s/, "_");
    let recipeURL = "noURL";
    if (req.body.link){
      recipeURL = req.body.link;

    }

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

    if (req.body.favourite === "on"){
      favourite = true;
    }

    recipes.updateMany({recipeTitleShort:req.params.recipeTitleShort}, { $set: {
      "title": req.body.title,
      "recipeTitleShort":recipeTitleShort,
      "recipeURL": recipeURL,
      "imageUrl": req.body.image,
      "description": req.body.description,
      "steps": steps,
      "ingredients":ingredients,
      "favourite":favourite
    }})

    if (req.body.link){
      setTimeout(function(){res.redirect("/recipeList")}, 2000);
    } else{
      setTimeout(function(){res.redirect("/recipe/"+ recipeTitleShort)}, 2000);
  }
  })

  //find recipe and delete it entirely
  app.post('/deleteRecipe', function(req, res) {
    recipes.deleteOne({recipeTitleShort:req.body.recipeTitleShort})
    res.redirect("/recipeList");
  });
  
  //Initiate Express listening on port
  app.listen(port, () => {
    console.log(`Example app listening on port ${port}`)
  })

});
