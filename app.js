//Requires
const express = require("express");
const ejs = require("ejs");
const bodyParser = require('body-parser');
require('dotenv').config()
//Express App and Port
const app = express()
const port = process.env.PORT || 3000;
const fs = require('fs');
const multer  = require('multer')
const upload = multer({ dest: 'uploads/' })
const sharp = require('sharp');


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
  const images = db.collection('images');

  ///Store image test
  // Function to encode an image into Base64
  function encodeImageToBase64(imagePath) {
    const bitmap = fs.readFileSync(imagePath);
    return Buffer.from(bitmap).toString('base64'); 
  }


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

  //Render page for linking a new recipe
  app.get('/newRecipePicture', (req, res) => {
    res.render('newRecipePicture', {recipeExists: false})
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

    //When a recipe url is entered, find the recipe and send the recipe information
  //to be displayed on the recipe page
  app.get("/recipeImg/:recipeTitleShort", (req, res) => {
    recipes.find({recipeTitleShort:req.params.recipeTitleShort}).toArray((err, fullRecipe) => {
      console.log(fullRecipe);
      let imageNumber = fullRecipe[0].recipeIsIMG.length;
      console.log(imageNumber);
      res.render("recipeImg", {recipe:fullRecipe, imageNumber:imageNumber});
      });
  })

  app.get("/recipeImg/imgURL/:recipeTitleShort/:number", (req, res) => {
    let imageNumber = req.params.number;
    recipes.find({recipeTitleShort:req.params.recipeTitleShort}).toArray((err, fullRecipe) => {
      const img = fullRecipe[0].recipeIsIMG[imageNumber];
      res.contentType(img.contentType);
      res.send(img.data.buffer);
      });
  })

  //Send user to the editing page for the chosen recipe
  app.get('/recipe/:recipeTitleShort/editRecipe', function(req, res) {
    recipes.find({recipeTitleShort:req.params.recipeTitleShort}).toArray((err, recipe) => {
      console.log(recipe);
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
    recipes.find({recipeTitleShort:recipeTitleShort}).toArray(function(err, result){
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
      setTimeout(function(){res.redirect("/recipe/"+ recipeTitleShort)}, 2000)
    })
  })

    //Submitted newly created recipe link
    app.post('/newRecipeLink', function(req, res) {

      //shorten recipe title to use in database
      let recipeTitleShort = req.body.title.replace(/[^a-zA-Z\s]/g, "").replace(/\s/, "_");

      //make url the link from the form
      let recipeURL = req.body.link;

      //Redirect back to page with error message if this recipe name already exists
      recipes.find({recipeURL:recipeURL}).toArray(function(err, result){
        if (result[0] !== undefined){
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

      //Submitted newly created recipe link
      app.post('/newRecipePicture', upload.array('recipeImage', 6), function(req, res) {

        //shorten recipe title to use in database
        let recipeTitleShort = req.body.title.replace(/[^a-zA-Z\s]/g, "").replace(/\s/, "_");
  
        //make url the link from the form
        let recipeURL = "noURL";
        let images = [];
  
        let readFiles = req.files.map(file => {
          return new Promise((resolve, reject) => {
          // Get the size of the file in megabytes
          const sizeInMB = fs.statSync(file.path).size / (1024*1024);
          console.log(`Original image size: ${sizeInMB.toFixed(2)} MB`); 

          // Calculate the quality: start with 100 for small files and decrease as the file size gets larger
          let quality = 100;
          /*if (sizeInMB < 1 && sizeInMB > 0.5){
            quality = 85;         
          } else {          
            quality = Math.min(100, Math.max(10, Math.floor(100 * 0.95 / 1)));
          }*/

          sharp(file.path)
            .resize(1400)
            .jpeg({ quality: 80}) // adjust quality based on file size
            .toBuffer()
            .then(data => {
              const img = {
                data: data,
                contentType: 'image/jpeg'
              };
              const newSizeInMB = img.data.length / (1024*1024);
              console.log(`Final image size: ${newSizeInMB.toFixed(2)} MB`); 
              resolve(img);
            })
            .catch(err => {
              reject(err);
            });
          });
        });
        
        Promise.all(readFiles)
          .then(images => {
            //Redirect back to page with error message if this recipe name already exists
            recipes.find({recipeTitleShort:recipeTitleShort}).toArray(function(err, result){
              if (result[0] !== undefined){
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
                recipeIsIMG:images,
                isLink:false,
                isImg:true
              })
        
              //redirect to new recipes page, with a short wait for the database to have time to fill it
              setTimeout(function(){res.redirect("/recipeList")}, 2000)
            })

          })
          .catch(err => {
            console.error(err);
            // Handle error...
          });
        
      })
  


  //Favourite submission. Find recipe by recieved URL, if its not a favourite, make it one, else remove it from favourites
  app.post('/favouriteRecipe', function(req, res) {


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

    //Generate short title to use as local url and database
    let recipeTitleShort = req.body.title.replace(/[^a-zA-Z\s]/g, "").replace(/\s/, "_");

    //If this is a local recipe, we use "noURL" as the url, otherwise is is the link received from the add link page
    let recipeURL = "noURL";
    if (req.body.link){
      recipeURL = req.body.link;
    }

    //Add all steps and ingredients into an array to be stored in the database
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

    //check if favourite was selected.
    if (req.body.favourite === "on"){
      favourite = true;
    }

    //update the recipe
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

    //if we came from editing a link, redirect to the recipe list, otherwise, redirect to the local recipe
    if (req.body.link || req.body.isImg){
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
