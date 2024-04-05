//Requires
const express = require("express");
const ejs = require("ejs");
const bodyParser = require('body-parser');
const axios = require('axios');
const sharp = require('sharp');
const recipeScraper = require("@brandonrjguth/recipe-scraper");
const fs = require('fs');
const multer  = require('multer');
require('dotenv').config();

//Setup express, port
const app = express();
const port = process.env.PORT || 3000;

//Multer set to use memory for image uploads
//This is so they can be altered before sending to mongodb
//without being stored locally
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

app.use(express.static('public'));
app.use(bodyParser.urlencoded({ extended: true }));
app.set('view engine', 'ejs');

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



//Wrap everything in an async function so that we can do things asynchronously
async function run() {
  try {
    // Connect the client to the server
    await client.connect();
    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });

  //Create Database and Collection
  const db = client.db('recipeBook');
  const recipes = db.collection('recipes');
  const images = db.collection('images');


  //---------------------------------------------------------------//
  //---------------------GET ROUTES--------------------------------//
  //---------------------------------------------------------------//


  app.get('/', (req, res) => {
    res.redirect('recipeList');
  })

  //Favourites route, finds favourites, sorts, displays recipeList with only favourites
  app.get("/favourites", async(req,res) =>{
    try{
      let recipeList = await recipes.find({favourite:true}).sort({"title":1}).toArray();
      res.render('recipeList', {recipeList:recipeList, favourites:true});
      } catch (err) {
        console.error(err);
      }
  })

  app.get('/newRecipePage', (req, res) => {
    res.render('newRecipe', {recipeExists: false, isImg:false, isLink:false})
  })

  app.get('/convertRecipe', (req, res) =>{
    res.render('convertRecipe', {recipeExists:false});
  })

  app.get('/newRecipeLink', (req, res) => {
    res.render('newRecipe', {recipeExists: false, isLink:true, isImg:false})
  })

  app.get('/newRecipePicture', (req, res) => {
    res.render('newRecipe', {recipeExists: false, isImg:true, isLink:false})
  })

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
  
  //Find the recipe by title and render its page
  app.get("/recipe/:title", async(req, res) => {
    try{
      let fullRecipe = await recipes.findOne({title:req.params.title});
      res.render("recipe", {recipe:fullRecipe});
    } catch (err) {
      console.error(err);
    }
  })

  //Find an image recipe and display its page
  app.get("/recipeImg/:title", async(req, res) => {
    try{
      let fullRecipe = await recipes.findOne({title:req.params.title});
      let imageNumber = fullRecipe.images.length;
      res.render("recipeImg", {recipe:fullRecipe, imageNumber:imageNumber});
    } catch (err) {
      console.error(err);
    }
  })

  //Send user to the editing page for the chosen recipe
  app.get('/recipe/:title/editRecipe', async(req, res) => {
    try{
      let recipe = await recipes.findOne({title:req.params.title})
      res.render("editRecipe", {recipe:recipe, recipeExists:false});
    } catch (err) {
      console.error(err);
    }
  });


  //--------------------- IMAGE SERVING ROUTES -----------------------------//
  //Pictures for a picture recipe
  app.get("/recipeImg/imgURL/:title/:number", async(req, res) => {
    try{
      let imageNumber = req.params.number;
      let fullRecipe = await recipes.findOne({title:req.params.title})
      let img = fullRecipe.images[imageNumber];
      res.send(img.buffer);
    } catch (err) {
      console.error(err);
    }
  })

  //Thumbnails for regular recipe
  app.get("/recipeImg/imgThumbURL/:title", async(req, res) => {
    try{
      let fullRecipe = await recipes.findOne({title:req.params.title})
      const img = fullRecipe.images;
      res.send(img.buffer);
    } catch (err) {
      console.error(err);
    }
  })




  //---------------------------------------------------------------//
  //---------------------POST ROUTES--------------------------------//
  //---------------------------------------------------------------//

  //Submitted newly created recipe
  app.post('/newRecipe', upload.array('recipeImage', 6), async(req, res) =>{
    try{

      //setup initial variables to be used in recipe object
      let title = req.body.title;
      let favourite = !!req.body.favourite;
      let isImg = false;
      let isLink = false;
      let recipeUrl = "noUrl";
      let images = undefined;
      let steps = [];
      let ingredients = [];
      let keysArray = Object.keys(req.body);
      let valuesArray = Object.values(req.body);

      //Redirect back to page with error message if this recipe name already exists
      let result = await recipes.findOne({title:title});
      if (result !== null){
        res.render("newRecipe", {recipeExists: true, isLink:false, isImg:false})
        return
      } 
      
      //Determine if there are any images and compress them
      //If its not an image recipe and has an image, it's a thumbnail. Compress and store it
      //If its an image recipe compress and store the full array of images
      if (!req.body.isImg && req.files.length == 1){
         images = await sharp(req.files[0].buffer)
        .resize(1400)
        .jpeg({ quality: 80 })
        .toBuffer();
      }
      if (req.body.isImg){
        isImg = true;
        images = await Promise.all(req.files.map(async (file) => {
          return await sharp(file.buffer)
            .resize(1400)
            .jpeg({ quality: 80 })
            .toBuffer();
        }));
      };

      //If there is a link, set it as the url
      if (req.body.link){
        recipeUrl = req.body.link;
        isLink = true;
      }

      //Find steps and ingredients through key value pairs if they exist
      //Add to respective arrays
      for (i = 0; i < keysArray.length; i++){
        if (keysArray[i].includes("step")){
          steps.push(valuesArray[i]);
        }
        if (keysArray[i].includes("ingredient")){
          ingredients.push(valuesArray[i]);
        }
      }

      //Add the recipe into the recipe collection on mongoDB
      await recipes.insertOne({
          title: req.body.title,
          favourite:favourite,
          isImg:isImg,
          isLink:isLink,
          recipeUrl: recipeUrl,
          images: images,
          description: req.body.description,
          steps: steps,
          ingredients:ingredients,
        })

    res.redirect("recipeList");
    } catch (err) {
      console.error(err);
    }
  })


//Convert a link to a Recipe
app.post('/convertRecipe', async(req, res) =>{
  try {
    //use recipeScraper to generate recipe from URL
    const url = req.body.link;
    let recipe = await recipeScraper(url).then(recipe => {return recipe});

    //Check if recipe title already exists in DB, if so, render page again alerting user
    let result = await recipes.find({title:recipe.name}).toArray();
    if (result[0] !== undefined){
      console.log("recipeExists");
      res.render("convertRecipe", {recipeExists: true})
      return
    } else {

      //Use axios to grab image from the recipe, then use sharp to compress it
      let image = await axios({
        method: 'get',
        url: recipe.image,
        responseType: 'arraybuffer'
      });
      const imageBuffer = await sharp(image.data)
      .resize(1400)
      .jpeg({ quality: 80 })
      .toBuffer();

      //Add recipe
      await
      recipes.insertOne({
        title:recipe.name,
        favourite:!!req.body.favourite,
        isImg:false,
        isLink:false,
        recipeUrl:"noUrl",
        description:recipe.description,
        images: imageBuffer,
        ingredients:recipe.ingredients,
        steps:recipe.instructions,
      })
      res.redirect('recipeList');
    }
  } catch (err){
    console.log(err);
  }
})

  //Favourite submission. Find recipe by recieved URL, if its not a favourite, make it one, else remove it from favourites
  app.post('/favouriteRecipe', async(req, res) => {
    try{
      let recipe = await recipes.findOne({title:req.body.title})
      if (recipe.favourite === false){
        await recipes.updateOne({title:req.body.title}, { $set: {"favourite":true}})
      } else {
        await recipes.updateOne({title:req.body.title}, { $set: {"favourite":false}})
      }

      //redirect based on page the favourite was selected from
      if (req.get('Referrer').includes("recipeList")){
        res.redirect("recipeList");
      } else if (req.get('Referrer').includes('favourites')){
        res.redirect("favourites");
      } else if (req.get('Referrer').includes('recipeImg')){
        res.redirect("recipeImg/" + recipe.title);
      }else {
        res.render("recipe", {recipe:recipe})
      }
    
    } catch (err) {
      console.error(err);
    }
  });

  
  //Edit recipe
  app.post("/recipe/:title/editRecipe", upload.single('recipeImage'), async(req, res) => {
    try{
      let steps = [];
      let ingredients = [];

      //Add all steps and ingredients into an array to be stored in the database
      let keysArray = Object.keys(req.body);
      let valuesArray = Object.values(req.body);

      for (i = 0; i < keysArray.length; i++){
        if (keysArray[i].includes("step")){
          steps.push(valuesArray[i]);
        }
        if (keysArray[i].includes("ingredient")){
          ingredients.push(valuesArray[i]);
        }
      }

      //If there is a new thumbnail, compress and store
      if (req.file){
         let imageBuffer = await sharp(req.file.buffer)
        .resize(1400)
        .jpeg({ quality: 80 })
        .toBuffer();
        await recipes.updateMany({title:req.params.title}, { $set: {
          images:imageBuffer
        }})
      }

      //update the recipe
      await recipes.updateMany({title:req.params.title}, { $set: {
        "title": req.body.title,
        "recipeUrl": req.body.recipeUrl || "noUrl",
        "description": req.body.description,
        "steps": steps,
        "ingredients":ingredients,
        "favourite":!!req.body.favourite
      }})

      //if we came from editing a link, redirect to the recipe list, otherwise, redirect to the local recipe
      if (req.body.link || req.body.isImg){
        res.redirect("/recipeList");
      } else{
        res.redirect("/recipe/"+ req.body.title);
      }
    } catch (err) {
      console.error(err);
    }
  })

  //Find recipe and delete it entirely
  app.post('/deleteRecipe', async(req, res) => {
    try{
      await recipes.deleteOne({title:req.body.title});
      res.redirect("/recipeList");
    } catch (err) {
      console.error(err);
    }
  });


  //Search Recipe by Title or Ingrediient
  app.post('/search', async(req, res) => {
    try{
      //Find by Title and then by Ingredient
      let byTitle = await recipes.find({ "title": { "$regex": "\\b" + req.body.search + "\\b", "$options": "i" } }).toArray();
      let byIngredient = await recipes.find({ "ingredients": { "$regex": "\\b" + req.body.search + "\\b", "$options": "i" } }).toArray();

      //Combine Results into single array
      let combinedArray = byTitle.concat(byIngredient);

      //Filter out duplicates
      let recipeList = combinedArray.filter((recipe, index, self) =>
        index === self.findIndex((t) => (
          t.title === recipe.title
        ))
      );

      //Sort the array alphabetically by title and render
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

 