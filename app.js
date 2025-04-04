//Requires
const express = require("express");
const ejs = require("ejs");
const bodyParser = require('body-parser');
const axios = require('axios');
const sharp = require('sharp');
const recipeScraper = require("@brandonrjguth/recipe-scraper");
const fs = require('fs');
const multer  = require('multer');
const session = require('express-session');
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const bcrypt = require('bcrypt');
const MongoStore = require('connect-mongo');
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
app.use(express.json());


//Mongo Atlas Connection
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb'); // Added ObjectId
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

  //Create Database and Collections
  const db = client.db('recipeBook');
  const recipes = db.collection('recipes');
  const users = db.collection('users'); // Add users collection

  // --- Session Configuration ---
  // Secret should be in .env file for production
  const secret = process.env.SESSION_SECRET || 'a default secret for development'; 
  app.use(session({
    secret: secret,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
      clientPromise: Promise.resolve(client), // Use the connected client
      dbName: 'recipeBook',
      collectionName: 'sessions',
      ttl: 14 * 24 * 60 * 60 // = 14 days. Default
    }),
    cookie: { maxAge: 1000 * 60 * 60 * 24 * 7 } // 1 week cookie
  }));

  // --- Passport Configuration ---
  app.use(passport.initialize());
  app.use(passport.session());

  // Passport Local Strategy
  passport.use(new LocalStrategy(
    async (username, password, done) => {
      try {
        const user = await users.findOne({ username: username });
        if (!user) {
          return done(null, false, { message: 'Incorrect username.' });
        }
        const match = await bcrypt.compare(password, user.password);
        if (!match) {
          return done(null, false, { message: 'Incorrect password.' });
        }
        return done(null, user);
      } catch (err) {
        return done(err);
      }
    }
  ));

  // Serialize user: determines which data of the user object should be stored in the session.
  passport.serializeUser((user, done) => {
    done(null, user._id); // Store user ID in session
  });

  // Deserialize user: retrieves user data from the session using the ID.
  passport.deserializeUser(async (id, done) => {
    try {
      // Important: Ensure 'id' is converted to ObjectId if necessary
      const userId = typeof id === 'string' ? new ObjectId(id) : id; 
      const user = await users.findOne({ _id: userId });
      done(null, user); // Attach user object to req.user
    } catch (err) {
      done(err);
    }
  });


  // Middleware to check if user is authenticated
  function ensureAuthenticated(req, res, next) {
    if (req.isAuthenticated()) {
      return next();
    }
    res.redirect('/login'); // Redirect to login page if not authenticated
  }

  // Middleware to pass user info to all views
  app.use((req, res, next) => {
    res.locals.currentUser = req.user; // Make user object available in all EJS templates
    next();
  });


  //---------------------------------------------------------------//
  //---------------------GET ROUTES--------------------------------//
  //---------------------------------------------------------------//


//FUNCTION FOR SEEDING NEW RECIPES MANUALLY//

/*let seed = async function() {
    try {
let title = ``
let desc = ``
let ing = ``
let step = ``

ing = ing.split('\n')
step = step.split(`\n`)

await recipes.insertOne({
          title: title,
          favourite:false,
          isImg:false,
          isLink:false,
          recipeUrl: "noUrl",
          images: null,
          description: desc,
          steps: step,
          ingredients:ing,
          categories:null
        })

    } catch {

    }
  }
  seed();*/

  app.get('/', (req, res) => {
    res.redirect('recipeList');
  })

  //Favourites route, finds favourites, sorts, displays recipeList with only favourites
  app.get("/favourites", ensureAuthenticated, async(req,res) =>{ // Protected
    try{
      // We might want to filter favourites by user ID in the future
      let recipeList = await recipes.find({favourite:true}).sort({"title":1}).toArray();
      res.render('recipeList', {recipeList:recipeList, favourites:true});
      } catch (err) {
        console.error(err);
      }
  })

  app.get("/thumbs", ensureAuthenticated, async(req, res) => { // Protected (assuming related to user content)
    try{
      // We might want to filter by user ID in the future
      let recipeList = await recipes.find({favourite:true}).sort({"title":1}).toArray();
      res.render('thumbs', {recipeList:recipeList, favourites:true, thumbnails:false});
    }catch (err){
      console.log(err);
    }
  });

  app.get('/newRecipePage', ensureAuthenticated, (req, res) => { // Protected
    res.render('newRecipe', {recipeExists: false, isImg:false, isLink:false})
  })

  app.get('/convertRecipe', ensureAuthenticated, (req, res) =>{ // Protected
    res.render('convertRecipe', {recipeExists:false, recipeSiteError:false});
  })

  app.get('/newRecipeLink', ensureAuthenticated, (req, res) => { // Protected
    res.render('newRecipe', {recipeExists: false, isLink:true, isImg:false})
  })

  app.get('/newRecipePicture', ensureAuthenticated, (req, res) => { // Protected
    res.render('newRecipe', {recipeExists: false, isImg:true, isLink:false})
  })

  app.get('/recipeFrom', ensureAuthenticated, (req, res) => { // Protected
    res.render('recipeFrom', {recipeExists: false})
  })

  //send array of recipes belonging to the logged-in user to recipeList page
  app.get('/recipeList', ensureAuthenticated, async(req, res) => { // Protected & User-Specific
    try{
    const userId = req.user._id;
    let recipeList = await recipes.find({ userId: userId }).collation({locale: "en"}).sort({"title":1}).toArray()
    // console.log(recipeList); // Keep console log? Optional.
    res.render('recipeList', {recipeList:recipeList, favourites:false}) // Pass currentUser implicitly via middleware
    } catch (err) {
      console.error(err);
      res.status(500).send('Error fetching recipe list');
    }
  })
  
  //Find the recipe by title and render its page, ensuring user ownership
  app.get("/recipe/:title", ensureAuthenticated, async(req, res) => { // Protected & User-Specific Check
    try{
      const userId = req.user._id;
      let fullRecipe = await recipes.findOne({title:req.params.title});

      if (!fullRecipe) {
        // Handle recipe not found (optional, could redirect or show 404)
        return res.redirect('/recipeList'); 
      }
      // Convert both to strings for reliable comparison
      if (!fullRecipe.userId || fullRecipe.userId.toString() !== userId.toString()) {
        console.log(`User ${userId} attempted to access recipe owned by ${fullRecipe.userId}`);
        // Redirect if user doesn't own the recipe
        return res.redirect('/recipeList'); 
      }

      res.render("recipe", {recipe:fullRecipe}); // Pass currentUser implicitly
    } catch (err) {
      console.error(err);
    }
  })

  //Find an image recipe and display its page, ensuring user ownership
  app.get("/recipeImg/:title", ensureAuthenticated, async(req, res) => { // Protected & User-Specific Check
    try{
      const userId = req.user._id;
      let fullRecipe = await recipes.findOne({title:req.params.title});
      
      if (!fullRecipe) {
        return res.redirect('/recipeList');
      }
      if (!fullRecipe.userId || fullRecipe.userId.toString() !== userId.toString()) {
         console.log(`User ${userId} attempted to access image recipe owned by ${fullRecipe.userId}`);
         return res.redirect('/recipeList');
      }

      let imageNumber = fullRecipe.images ? fullRecipe.images.length : 0; // Handle case where images might be null/undefined
      res.render("recipeImg", {recipe:fullRecipe, imageNumber:imageNumber}); // Pass currentUser implicitly
    } catch (err) {
      console.error(err);
    }
  })

  //Send user to the editing page for the chosen recipe, ensuring ownership
  app.get('/recipe/:title/editRecipe', ensureAuthenticated, async(req, res) => { // Protected & User-Specific Check
    try{
      const userId = req.user._id;
      let recipe = await recipes.findOne({title:req.params.title});

      if (!recipe) {
        return res.redirect('/recipeList');
      }
      if (!recipe.userId || recipe.userId.toString() !== userId.toString()) {
        console.log(`User ${userId} attempted to edit recipe owned by ${recipe.userId}`);
        return res.redirect('/recipeList');
      }

      res.render("editRecipe", {recipe:recipe, recipeExists:false}); // Pass currentUser implicitly
    } catch (err) {
      console.error(err);
    }
  });

  app.get('/shoppingList', ensureAuthenticated, async(req, res) => { // Protected
    try{
      // Add check: Filter list items by logged-in user? (Future enhancement)
      let list = await recipes.find({onList:true}).toArray();
      let ingredients = [];
      list.forEach((listItem) => {
        listItem.ingredients.forEach((ing) => {
          ingredients.push(ing);
        })
      })
    // Regular expression to match numbers, units, and fractions
    let regex = /(\b\d+(\.\d+)?\/?\d*\s*)?(lbs?|oz|cans?|Tbsp|packed|diced|minced|tsp|\bcup\b|cups|\bg\b|grams|handful|crushed|to garnish|low-fat|\d+g|\d+l|\d+ml|kg|of|kilograms|\bml\b|\bl\b|liters|pinch|dash|cloves?|sprigs?|bunches?|slices?|sticks?|quarts?|pints?|gallons?|teaspoons?|grated|ground|jar|bunch|fresh|to taste|chopped|freshly|sliced|diced|tablespoons?|fluid\sounces?)\b|\.|½|¼|¾|\b\d+\b|,|\/+/gi;
    

    // Remove numbers, units, fractions, then sort based on cleaned
    
    let ingredientsWithOriginals = ingredients.map(ingredient => ({
      original: ingredient,
      cleaned: ingredient.replace(regex, '').trim()
    }));
    
    ingredientsWithOriginals.sort((a, b) => a.cleaned.localeCompare(b.cleaned, undefined, {sensitivity: 'base'}));
    let detailedIngredients = ingredientsWithOriginals.map(item => item.original);



    //Simplified version of ingredients with no duplicates
    let simplifiedIngredients = ingredients.map(ingredient => ingredient.toLowerCase().replace(regex, '').trim()).sort();
    simplifiedIngredients.sort((a, b) => a.localeCompare(b, undefined, {sensitivity: 'base'}));
    simplifiedIngredients = [...new Set(simplifiedIngredients)];


    
      res.render("shoppingList", {simplified:simplifiedIngredients, detailed:detailedIngredients})
    } catch (err) {
      console.error(err);
    }
  });


  //---------------------------------------------------------------//
  //----------------- AUTHENTICATION GET ROUTES -------------------//
  //---------------------------------------------------------------//

  // Display login page
  app.get('/login', (req, res) => {
    // Pass any flash messages if they exist (e.g., from failed login attempts)
    // Note: req.flash requires connect-flash middleware, which we haven't installed.
    // For simplicity, we'll just render the view without flash messages for now.
    // If you want flash messages, we'd need to `npm install connect-flash` and configure it.
    res.render('login', { error: null }); // Pass null initially
  });

  // Display registration page
  app.get('/register', (req, res) => {
    res.render('register', { error: null }); // Pass null initially
  });

  // Handle logout
  app.get('/logout', (req, res, next) => {
    req.logout(function(err) { // req.logout requires a callback function
      if (err) { return next(err); }
      res.redirect('/'); // Redirect to homepage after logout
    });
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
  //----------------- AUTHENTICATION POST ROUTES ------------------//
  //---------------------------------------------------------------//

  // Handle registration
  app.post('/register', async (req, res) => {
    try {
      const { username, password, passwordConfirm } = req.body;

      // Basic validation
      if (!username || !password || !passwordConfirm) {
        return res.render('register', { error: 'All fields are required.' });
      }
      if (password !== passwordConfirm) {
        return res.render('register', { error: 'Passwords do not match.' });
      }

      // Check if user already exists
      const existingUser = await users.findOne({ username: username });
      if (existingUser) {
        return res.render('register', { error: 'Username already taken.' });
      }

      // Hash password
      const saltRounds = 10; // Recommended salt rounds
      const hashedPassword = await bcrypt.hash(password, saltRounds);

      // Create new user
      const newUser = {
        username: username,
        password: hashedPassword
      };
      await users.insertOne(newUser);

      // Log the user in automatically after registration
      req.login(newUser, (err) => { // Passport's req.login method
         if (err) {
           console.error("Login after registration failed:", err);
           return res.redirect('/login'); // Redirect to login on error
         }
         return res.redirect('/recipeList'); // Redirect to recipe list on success
      });

    } catch (err) {
      console.error("Registration error:", err);
      res.render('register', { error: 'An error occurred during registration.' });
    }
  });

  // Handle login
  app.post('/login', passport.authenticate('local', {
    successRedirect: '/recipeList', // Redirect on successful login
    failureRedirect: '/login',     // Redirect back to login on failure
    // failureFlash: true // Requires connect-flash if you want flash messages
  }), (req, res) => {
      // This callback is only called on successful authentication
      // You could add additional logic here if needed after login
      // But typically the redirects handle it.
  });


  //---------------------------------------------------------------//
  //--------------------- RECIPE POST ROUTES ----------------------//
  //---------------------------------------------------------------//

  //Submitted newly created recipe
  app.post('/newRecipe', ensureAuthenticated, upload.array('recipeImage', 6), async(req, res) =>{ // Protected
    try{
      // Add user ID to the recipe object
      const userId = req.user._id; 
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
      let categories = undefined;

      if (req.body.categories){
        categories = req.body.categories.split(",");
      }

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
          categories:categories,
          userId: userId // Store the user ID
        })


    if (isImg){
      res.redirect("recipeIMG/"+req.body.title)
    } else if (isLink){
      res.redirect("recipeList")
    } else {
      res.redirect("recipe/"+req.body.title);
    }

    } catch (err) {
      console.error(err);
    }
  })


//Convert a link to a Recipe
app.post('/convertRecipe', ensureAuthenticated, async(req, res) =>{ // Protected
  try {
    // Add user ID to the recipe object
    const userId = req.user._id;
    //use recipeScraper to generate recipe from URL
    const url = req.body.link;
    let recipe = await recipeScraper(url).then(recipe => {return recipe});

    let categories = undefined;
    if (req.body.categories){
      categories = req.body.categories.split(",");
    }


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
        categories:categories,
        userId: userId // Store the user ID
      })
      res.redirect('recipe/'+recipe.name);
    }
  } catch (err){
    console.log(err);
    res.render('convertRecipe', {recipeSiteError:true, recipeExists:false})
  }
})

  //Favourite submission. Find recipe by recieved URL, if its not a favourite, make it one, else remove it from favourites
  app.post('/favouriteRecipe', ensureAuthenticated, async(req, res) => { // Protected
    try{
      // Add check: Does this recipe belong to the logged-in user? (Future enhancement)
      // Or maybe favourites are user-specific, stored separately? Needs design decision.
      let recipe = await recipes.findOne({title:req.body.title})
      if (recipe.favourite === false){
        await recipes.updateOne({title:req.body.title}, { $set: {"favourite":true}})
      } else {
        await recipes.updateOne({title:req.body.title}, { $set: {"favourite":false}})
      }
    
    } catch (err) {
      console.error(err);
    }
  });

  
  //Edit recipe, ensuring ownership before update
  app.post("/recipe/:title/editRecipe", ensureAuthenticated, upload.single('recipeImage'), async(req, res) => { // Protected & User-Specific Check
    try{
      const userId = req.user._id;
      const originalTitle = req.params.title;

      // First, verify ownership of the original recipe
      const originalRecipe = await recipes.findOne({ title: originalTitle });
      if (!originalRecipe) {
          console.log(`Edit failed: Original recipe "${originalTitle}" not found.`);
          return res.redirect('/recipeList'); // Or show an error
      }
      if (!originalRecipe.userId || originalRecipe.userId.toString() !== userId.toString()) {
          console.log(`User ${userId} attempted to POST edit for recipe owned by ${originalRecipe.userId}`);
          return res.redirect('/recipeList'); // Or show an error
      }

      // Proceed with gathering updated data
      let steps = [];
      let ingredients = [];
      let categories = undefined;

      if (req.body.categories){
        categories = req.body.categories.split(",")
      }

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
        "recipeUrl": req.body.link || "noUrl",
        "description": req.body.description,
        "steps": steps,
        "ingredients":ingredients,
        "favourite":!!req.body.favourite,
        "categories":categories
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

  //Find recipe and delete it entirely, ensuring ownership
  app.post('/deleteRecipe', ensureAuthenticated, async(req, res) => { // Protected & User-Specific Check
    try{
      const userId = req.user._id;
      const titleToDelete = req.body.title;

      // Verify ownership before deleting
      const recipeToDelete = await recipes.findOne({ title: titleToDelete });
      if (!recipeToDelete) {
          console.log(`Delete failed: Recipe "${titleToDelete}" not found.`);
           // Recipe doesn't exist, maybe already deleted. Redirect gracefully.
          return res.redirect("/recipeList");
      }
      if (!recipeToDelete.userId || recipeToDelete.userId.toString() !== userId.toString()) {
          console.log(`User ${userId} attempted to delete recipe owned by ${recipeToDelete.userId}`);
          // Don't delete, just redirect
          return res.redirect("/recipeList"); 
      }

      // Ownership confirmed, proceed with deletion
      await recipes.deleteOne({ _id: recipeToDelete._id }); // Delete by ID for safety
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
      let byCategory = await recipes.find({ "categories": { "$regex": "\\b" + req.body.search + "\\b", "$options": "i" } }).toArray();


      //Combine Results into single array
      let combinedArray = byTitle.concat(byIngredient).concat(byCategory);


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

  app.post('/shoppingList', ensureAuthenticated, async(req, res) => { // Protected (toggling item on list)
    try{
      // Add check: Does this recipe belong to the logged-in user? (Future enhancement)
      let result = await recipes.findOne({title:req.body.title});
      if (result.onList){
        await recipes.updateOne({title:req.body.title}, { $set: {"onList":false}})
      } else {
        await recipes.updateOne({title:req.body.title}, { $set: {"onList":true}})
      }
    } catch{

    }
  });

  app.post("/deleteShop", ensureAuthenticated, async(req, res) => { // Protected (clearing list)
    // Add check: Only clear items belonging to the logged-in user? (Future enhancement)
    await recipes.updateMany({},{ $set: {"onList":false}})
    res.redirect("shoppingList");
  })
  
  
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
