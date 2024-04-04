//Requires
const express = require("express");
const ejs = require("ejs");
const bodyParser = require('body-parser');
require('dotenv').config();
//Express App and Port
const app = express();
const port = process.env.PORT || 3000;
const fs = require('fs');
const multer  = require('multer');
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });
const sharp = require('sharp');
const recipeScraper = require("@brandonrjguth/recipe-scraper");
const axios = require('axios');


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
const client = new MongoClient(uri,  {
  serverApi: {
      version: ServerApiVersion.v1,
      strict: true,
      deprecationErrors: true,
  }
}
);

async function run() {
  try {
    // Connect the client to the server (optional starting in v4.7)
    await client.connect();
    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
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

  //Render page for creating a new recipe
  app.get('/', (req, res) => {
    res.redirect('recipeList');
  })

  app.get("/favourites", async(req,res) =>{
    try{
      let recipeList = await recipes.find({favourite:true}).sort({"title":1}).toArray();
      res.render('recipeList', {recipeList:recipeList, favourites:true});
      } catch (err) {
        console.error(err);
      }
  })

  //Render page for creating a new recipe
  app.get('/newRecipePage', (req, res) => {
    res.render('newRecipe', {recipeExists: false})
  })

    //Convert a link to a Recipe
  app.get('/convertRecipe', (req, res) =>{
    res.render('convertRecipe', {recipeExists:false});
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
  app.get('/recipeList', async(req, res) => {
    try{
    let recipeList = await recipes.find().sort({"title":1}).toArray()
    res.render('recipeList', {recipeList:recipeList, favourites:false})
    } catch (err) {
      console.error(err);
      res.status(500).send('Error fetching recipe list');
    }
  })
  

  //When a recipe url is entered, find the recipe and send the recipe information
  //to be displayed on the recipe page
  app.get("/recipe/:recipeTitleShort", async(req, res) => {
    try{
      let fullRecipe = await recipes.find({recipeTitleShort:req.params.recipeTitleShort}).toArray();
      res.render("recipe", {recipe:fullRecipe});
    } catch (err) {
      console.error(err);
    }
  })

    //When a recipe url is entered, find the recipe and send the recipe information
  //to be displayed on the recipe page
  app.get("/recipeImg/:recipeTitleShort", async(req, res) => {
    try{
      let fullRecipe = await recipes.find({recipeTitleShort:req.params.recipeTitleShort}).toArray();
      let imageNumber = fullRecipe[0].recipeIsIMG.length;
      res.render("recipeImg", {recipe:fullRecipe, imageNumber:imageNumber});
    } catch (err) {
      console.error(err);
    }
  })

  app.get("/recipeImg/imgURL/:recipeTitleShort/:number", async(req, res) => {
    try{
      let imageNumber = req.params.number;
      let fullRecipe = await recipes.find({recipeTitleShort:req.params.recipeTitleShort}).toArray()
      const img = fullRecipe[0].recipeIsIMG[imageNumber];
      res.contentType(img.contentType);
      res.send(img.data.buffer);
    } catch (err) {
      console.error(err);
    }
  })

  app.get("/recipeImg/imgThumbURL/:recipeTitleShort/:number", async(req, res) => {
    try{
      let imageNumber = req.params.number;
      let fullRecipe = await recipes.find({recipeTitleShort:req.params.recipeTitleShort}).toArray()
      const img = fullRecipe[0].imageUrl;
      //res.contentType(img.contentType);
      res.send(img.buffer);
    } catch (err) {
      console.error(err);
    }
  })

  //Send user to the editing page for the chosen recipe
  app.get('/recipe/:recipeTitleShort/editRecipe', async(req, res) => {
    try{
      let recipe = await recipes.find({recipeTitleShort:req.params.recipeTitleShort}).toArray()
      res.render("editRecipe", {recipe:recipe, recipeExists:false});
    } catch (err) {
      console.error(err);
    }
  });

  //---------------------------------------------------------------//
  //---------------------POST ROUTES--------------------------------//
  //---------------------------------------------------------------//

  //Submitted newly created recipe
  app.post('/newRecipe', upload.single('recipeImage'), async(req, res) =>{
    try{

      console.log(req.file);
      //Take the title, and replace all spaces with underscores, remove punctuation.
      //This will be used as a human readable url for the recipe
      let recipeTitleShort = req.body.title.replace(/[^a-zA-Z\s]/g, "").replace(/\s/, "_");
      let recipeURL = "noURL";

      //Redirect back to page with error message if this recipe name already exists
      let result = await recipes.find({recipeTitleShort:recipeTitleShort}).toArray()
      if (result[0] !== undefined){
        console.log("duplicate");
        res.render("newRecipe", {recipeExists: true})
        return
      } 
      
      let imageBuffer = undefined;
  
      if (req.file){
         imageBuffer = await sharp(req.file.buffer)
        .resize(1400)
        .jpeg({ quality: 80 })
        .toBuffer();
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
        imageUrl: imageBuffer,
        description: req.body.description,
        steps: steps,
        ingredients:ingredients,
        favourite:favourite,
        isImg:false
      })

      //redirect to new recipes page, with a short wait for the database to have time to fill it
      setTimeout(function(){res.redirect("/recipe/"+ recipeTitleShort)}, 2000)      
    } catch (err) {
      console.error(err);
    }
  })

//Convert a link to a Recipe
app.post('/convertRecipe', async(req, res) =>{
  try {
    let favourite = false;

    if (req.body.favourite === "on"){
      favourite = true;
    }

    const url = req.body.link;

    let recipe = await recipeScraper(url).then(recipe => {return recipe});
    let result = await recipes.find({recipeTitleShort:recipe.name}).toArray();
    if (result[0] !== undefined){
      console.log("recipeExists");
      res.render("convertRecipe", {recipeExists: true})
      return
    } else {

      let image = await axios({
        method: 'get',
        url: recipe.image,
        responseType: 'arraybuffer'
      });

      const imageBuffer = await sharp(image.data)
      .resize(1400)
      .jpeg({ quality: 80 })
      .toBuffer();


      await
      recipes.insertOne({
        title:recipe.name,
        description:recipe.description,
        recipeTitleShort:recipe.name,
        recipeURL:"noURL",
        ingredients:recipe.ingredients,
        steps:recipe.instructions,
        imageUrl: imageBuffer,
        favourite:favourite,
        isImg:false
      })

      res.redirect('recipeList');
    }
  } catch (err){
    console.log(err);
  }
})


//Submitted newly created recipe link
app.post('/newRecipeLink', async(req, res) => {
  try{
    //shorten recipe title to use in database
    let recipeTitleShort = req.body.title.replace(/[^a-zA-Z\s]/g, "").replace(/\s/, "_");

    //make url the link from the form
    let recipeURL = req.body.link;

    //Redirect back to page with error message if this recipe name already exists
    let result = await recipes.find({recipeURL:recipeURL}).toArray();
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
      isLink:true,
      isImg:false
    })

    //redirect to new recipes page, with a short wait for the database to have time to fill it
    setTimeout(function(){res.redirect("/recipeList")}, 2000)
    
  } catch (err) {
    console.error(err);
  }
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
    //const sizeInMB = fs.statSync(file.buffer).size / (1024*1024);
    //console.log(`Original image size: ${sizeInMB.toFixed(2)} MB`); 

    // Calculate the quality: start with 100 for small files and decrease as the file size gets larger
    let quality = 100;

    sharp(file.buffer)
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
    .then(async(images) => {

      try{
        //Redirect back to page with error message if this recipe name already exists
        let result = await recipes.find({recipeTitleShort:recipeTitleShort}).toArray();
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

      } catch (err) {
        console.error(err);
      }
    })
    .catch(err => {
      console.error(err);
      // Handle error...
    });
  
})
  


  //Favourite submission. Find recipe by recieved URL, if its not a favourite, make it one, else remove it from favourites
  app.post('/favouriteRecipe', async(req, res) => {

    try{
      let recipe = await recipes.find({recipeTitleShort:req.body.recipeTitleShort}).toArray()
      if (recipe[0].favourite === false){
        await recipes.updateOne({recipeTitleShort:req.body.recipeTitleShort}, { $set: {"favourite":true}})
      } else {
        await recipes.updateOne({recipeTitleShort:req.body.recipeTitleShort}, { $set: {"favourite":false}})
      }

      recipe = await recipes.find({recipeTitleShort:req.body.recipeTitleShort}).toArray()
      //redirect based on page the favourite was selected from
      if (req.get('Referrer').includes("recipeList")){
        res.redirect("recipeList");
      } else if (req.get('Referrer').includes('favourites')){
        res.redirect("favourites");
      } else if (req.get('Referrer').includes('recipeImg')){
        res.redirect("recipeImg/" + recipe[0].recipeTitleShort);
      }else {
        res.render("recipe", {recipe:recipe})
      }
    
    } catch (err) {
      console.error(err);
    }
  });

  /*Edit submission. Repeat the same logic that is used for a new recipe, but this time, find and update the submitted recipe 
  for edditing*/
  app.post("/recipe/:recipeTitleShort/editRecipe", upload.single('recipeImage'), async(req, res) => {

    try{
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

     
  
      if (req.file){
         let imageBuffer = await sharp(req.file.buffer)
        .resize(1400)
        .jpeg({ quality: 80 })
        .toBuffer();

        await recipes.updateMany({recipeTitleShort:req.params.recipeTitleShort}, { $set: {
          imageUrl:imageBuffer
        }})
      }

      //update the recipe
      await recipes.updateMany({recipeTitleShort:req.params.recipeTitleShort}, { $set: {
        "title": req.body.title,
        "recipeTitleShort":recipeTitleShort,
        "recipeURL": recipeURL,
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

    } catch (err) {
      console.error(err);
    }

  })

  //find recipe and delete it entirely
  app.post('/deleteRecipe', async(req, res) => {
    try{
      await recipes.deleteOne({recipeTitleShort:req.body.recipeTitleShort});
      res.redirect("/recipeList");
    } catch (err) {
      console.error(err);
    }
  });

  app.post('/search', async(req, res) => {
    try{
      
      //find by Title, or Ingredient
      let byTitle = await recipes.find({ "title": { "$regex": req.body.search, "$options": "i" } }).toArray();
      let byIngredient = await recipes.find({ "ingredients": { "$regex": "\\b" + req.body.search + "\\b", "$options": "i" } }).toArray();

      //Combine Results into single array
      let combinedArray = byTitle.concat(byIngredient);

      //Filter out duplicates
      let recipeList = combinedArray.filter((recipe, index, self) =>
        index === self.findIndex((t) => (
          t.title === recipe.title
        ))
      );

      // Sort the array alphabetically by title
      recipeList.sort((a, b) => a.title.localeCompare(b.title));

      res.render('recipeList', {recipeList:recipeList, favourites:false})


    } catch (err){
      console.log(err);
    }
  });
  
  //Initiate Express listening on port
  app.listen(port, () => {
    console.log(`Example app listening on port ${port}`)
  })
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
   
  }
}
run().catch(console.dir);

 