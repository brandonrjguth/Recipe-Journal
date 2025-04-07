//Requires
const express = require("express");
const ejs = require("ejs");
const bodyParser = require('body-parser');
const axios = require('axios');
const sharp = require('sharp');
const recipeScraper = require("@brandonrjguth/recipe-scraper");
const fs = require('fs');
const multer = require('multer');
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
const client = new MongoClient(uri, {
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
    const users = db.collection('users');
    const userFavourites = db.collection('userFavourites'); // Collection for user favourites
    const userShoppingList = db.collection('userShoppingList'); // Collection for user shopping list items

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
          // Case-insensitive username lookup using regex
          const user = await users.findOne({ username: { $regex: `^${username}$`, $options: 'i' } });
          if (!user) {
            // Keep the generic message for security
            return done(null, false, { message: 'Incorrect username or password.' });
          }
          // Compare password
          const match = await bcrypt.compare(password, user.password);
          if (!match) {
             // Keep the generic message for security
            return done(null, false, { message: 'Incorrect username or password.' });
          }
          // Return the user object (with original casing) on success
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
              favourite:false, // Note: This field is likely obsolete now
              isImg:false,
              isLink:false,
              recipeUrl: "noUrl",
              images: null,
              description: desc,
              steps: step,
              ingredients:ing,
              categories:null,
              // userId: // Add appropriate user ID if seeding
            })
    
        } catch {
    
        }
      }
      seed();*/

    app.get('/', (req, res) => {
      res.redirect('recipeList');
    })

    //Favourites route - fetches recipes favourited by the current user
    app.get("/favourites", ensureAuthenticated, async (req, res) => { // Protected & User-Specific
      try {
        const userId = req.user._id;
        // Find all favourite entries for the current user
        const favouriteEntries = await userFavourites.find({ userId: userId }).toArray();
        // Extract the recipe IDs
        const recipeIds = favouriteEntries.map(fav => fav.recipeId);

        // Fetch the actual recipe documents using the extracted IDs
        const recipeObjectIds = recipeIds.map(id => typeof id === 'string' ? new ObjectId(id) : id);
        let recipeList = await recipes.find({ _id: { $in: recipeObjectIds } }).sort({ "title": 1 }).toArray();

        // Add the isCurrentUserFavourite flag for the view
        recipeList = recipeList.map(recipe => ({ ...recipe, isCurrentUserFavourite: true }));

        res.render('recipeList', { recipeList: recipeList, favourites: true }); // Pass currentUser implicitly
      } catch (err) {
        console.error("Error fetching favourites:", err);
        res.status(500).send('Error fetching favourites');
      }
    });

    // Thumbs route - fetches thumbnails for recipes favourited by the current user
    app.get("/thumbs", ensureAuthenticated, async (req, res) => { // Protected & User-Specific
      try {
        const userId = req.user._id;
        // Find favourite recipe IDs for the user
        const favouriteEntries = await userFavourites.find({ userId: userId }, { projection: { recipeId: 1 } }).toArray();
        const recipeIds = favouriteEntries.map(fav => fav.recipeId);
        const recipeObjectIds = recipeIds.map(id => typeof id === 'string' ? new ObjectId(id) : id);

        // Fetch the corresponding recipes
        let recipeList = await recipes.find({ _id: { $in: recipeObjectIds } }).sort({ "title": 1 }).toArray();

        // Add favourite status (always true for this route)
        recipeList = recipeList.map(recipe => ({ ...recipe, isCurrentUserFavourite: true }));

        res.render('thumbs', { recipeList: recipeList, favourites: true, thumbnails: false }); // Pass currentUser implicitly
      } catch (err) {
        console.error("Error fetching thumbs for favourites:", err);
        res.status(500).send('Error fetching favourite thumbnails');
      }
    });


    app.get('/newRecipePage', ensureAuthenticated, (req, res) => { // Protected
      res.render('newRecipe', { recipeExists: false, isImg: false, isLink: false })
    })

    app.get('/convertRecipe', ensureAuthenticated, (req, res) => { // Protected
      res.render('convertRecipe', { recipeExists: false, recipeSiteError: false });
    })

    app.get('/newRecipeLink', ensureAuthenticated, (req, res) => { // Protected
      res.render('newRecipe', { recipeExists: false, isLink: true, isImg: false })
    })

    app.get('/newRecipePicture', ensureAuthenticated, (req, res) => { // Protected
      res.render('newRecipe', { recipeExists: false, isImg: true, isLink: false })
    })

    app.get('/recipeFrom', ensureAuthenticated, (req, res) => { // Protected
      res.render('recipeFrom', { recipeExists: false })
    })

    //send array of recipes belonging to the logged-in user to recipeList page, indicating favourite status
    app.get('/recipeList', ensureAuthenticated, async (req, res) => { // Protected & User-Specific
      try {
        const userId = req.user._id;
        // Get user's recipes
        let recipeList = await recipes.find({ userId: userId }).collation({ locale: "en" }).sort({ "title": 1 }).toArray();

        // Get user's favourite recipe IDs for quick lookup
        const favouriteEntries = await userFavourites.find({ userId: userId }, { projection: { recipeId: 1 } }).toArray();
        const favouriteRecipeIds = new Set(favouriteEntries.map(fav => fav.recipeId.toString())); // Store as strings for easy comparison

        // Add favourite status to each recipe
        recipeList = recipeList.map(recipe => ({
          ...recipe,
          isCurrentUserFavourite: favouriteRecipeIds.has(recipe._id.toString())
        }));

        // console.log(recipeList); // Optional
        res.render('recipeList', { recipeList: recipeList, favourites: false }); // Pass currentUser implicitly
      } catch (err) {
        console.error("Error fetching recipe list:", err);
        res.status(500).send('Error fetching recipe list');
      }
    });

    // Route for the supported sites page
    app.get('/supported-sites', ensureAuthenticated, (req, res) => { // Protected (ensure user is logged in to see it)
        try {
            // Currently just renders the static EJS page
            // Future enhancement: Could fetch the list dynamically if needed
            res.render('supportedSites.ejs');
        } catch (err) {
            console.error("Error rendering supported sites page:", err);
            res.status(500).send('Error displaying supported sites');
        }
    });

    //Find the recipe by title and render its page, ensuring user ownership and favourite status
    app.get("/recipe/:title", ensureAuthenticated, async (req, res) => { // Protected & User-Specific Check
      try {
        const userId = req.user._id;
        let fullRecipe = await recipes.findOne({ title: req.params.title });

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

        // Check if the current user has favourited this recipe
        const isFavourite = await userFavourites.findOne({ userId: userId, recipeId: fullRecipe._id });
        fullRecipe.isCurrentUserFavourite = !!isFavourite; // Add flag to recipe object

        res.render("recipe", { recipe: fullRecipe }); // Pass currentUser implicitly, recipe now has favourite flag
      } catch (err) {
        console.error("Error fetching recipe:", err);
        res.status(500).send('Error fetching recipe');
      }
    })

    //Find an image recipe and display its page, ensuring user ownership and favourite status
    app.get("/recipeImg/:title", ensureAuthenticated, async (req, res) => { // Protected & User-Specific Check
      try {
        const userId = req.user._id;
        let fullRecipe = await recipes.findOne({ title: req.params.title });

        if (!fullRecipe) {
          return res.redirect('/recipeList');
        }
        if (!fullRecipe.userId || fullRecipe.userId.toString() !== userId.toString()) {
          console.log(`User ${userId} attempted to access image recipe owned by ${fullRecipe.userId}`);
          return res.redirect('/recipeList');
        }

        // Check if the current user has favourited this recipe
        const isFavourite = await userFavourites.findOne({ userId: userId, recipeId: fullRecipe._id });
        fullRecipe.isCurrentUserFavourite = !!isFavourite; // Add flag to recipe object

        let imageNumber = fullRecipe.images ? fullRecipe.images.length : 0; // Handle case where images might be null/undefined
        res.render("recipeImg", { recipe: fullRecipe, imageNumber: imageNumber }); // Pass currentUser implicitly, recipe now has favourite flag
      } catch (err) {
        console.error("Error fetching image recipe:", err);
        res.status(500).send('Error fetching image recipe');
      }
    })

    //Send user to the editing page for the chosen recipe, ensuring ownership
    app.get('/recipe/:title/editRecipe', ensureAuthenticated, async (req, res) => { // Protected & User-Specific Check
      try {
        const userId = req.user._id;
        let recipe = await recipes.findOne({ title: req.params.title });

        if (!recipe) {
          return res.redirect('/recipeList');
        }
        if (!recipe.userId || recipe.userId.toString() !== userId.toString()) {
          console.log(`User ${userId} attempted to edit recipe owned by ${recipe.userId}`);
          return res.redirect('/recipeList');
        }

        // Check if the current user has favourited this recipe (for consistency, though maybe not needed on edit page)
        const isFavourite = await userFavourites.findOne({ userId: userId, recipeId: recipe._id });
        recipe.isCurrentUserFavourite = !!isFavourite;

        res.render("editRecipe", { recipe: recipe, recipeExists: false }); // Pass currentUser implicitly
      } catch (err) {
        console.error("Error fetching recipe for edit:", err);
        res.status(500).send('Error fetching recipe for edit');
      }
    });

    // Shopping List route - fetches recipes added to the current user's list
    app.get('/shoppingList', ensureAuthenticated, async (req, res) => { // Protected & User-Specific
      try {
        const userId = req.user._id;
        // Find all shopping list entries for the current user
        const shoppingListEntries = await userShoppingList.find({ userId: userId }).toArray();
        // Extract the recipe IDs
        const recipeIds = shoppingListEntries.map(item => item.recipeId);

        // Fetch the actual recipe documents using the extracted IDs
        const recipeObjectIds = recipeIds.map(id => typeof id === 'string' ? new ObjectId(id) : id);
        let list = await recipes.find({ _id: { $in: recipeObjectIds } }).toArray();

        // Add the isOnCurrentUserList flag for the view (though maybe less critical here than favourite)
        list = list.map(recipe => ({ ...recipe, isOnCurrentUserList: true }));

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

        ingredientsWithOriginals.sort((a, b) => a.cleaned.localeCompare(b.cleaned, undefined, { sensitivity: 'base' }));
        let detailedIngredients = ingredientsWithOriginals.map(item => item.original);



        //Simplified version of ingredients with no duplicates
        let simplifiedIngredients = ingredients.map(ingredient => ingredient.toLowerCase().replace(regex, '').trim()).sort();
        simplifiedIngredients.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
        simplifiedIngredients = [...new Set(simplifiedIngredients)];



        res.render("shoppingList", { simplified: simplifiedIngredients, detailed: detailedIngredients })
      } catch (err) {
        console.error("Error fetching shopping list:", err);
        res.status(500).send('Error fetching shopping list');
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
      req.logout(function (err) { // req.logout requires a callback function
        if (err) { return next(err); }
        res.redirect('/'); // Redirect to homepage after logout
      });
    });


    //--------------------- IMAGE SERVING ROUTES -----------------------------//
    //Pictures for a picture recipe
    app.get("/recipeImg/imgURL/:title/:number", async (req, res) => {
      try {
        let imageNumber = req.params.number;
        let fullRecipe = await recipes.findOne({ title: req.params.title })
        // Add ownership check here too? Maybe less critical if URL isn't easily guessable.
        let img = fullRecipe.images[imageNumber];
        res.send(img.buffer);
      } catch (err) {
        console.error(err);
      }
    })

    //Thumbnails for regular recipe
    app.get("/recipeImg/imgThumbURL/:title", async (req, res) => {
      try {
        let fullRecipe = await recipes.findOne({ title: req.params.title })
        // Add ownership check here too? Maybe less critical if URL isn't easily guessable.
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
        const insertResult = await users.insertOne(newUser); // Get result to access insertedId

        // Log the user in automatically after registration
        // Need to fetch the newly created user object with _id for req.login
        const createdUser = await users.findOne({ _id: insertResult.insertedId });
        if (!createdUser) {
          console.error("Failed to find newly registered user for login.");
          return res.redirect('/login');
        }

        req.login(createdUser, (err) => { // Passport's req.login method needs the user object
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
    app.post('/newRecipe', ensureAuthenticated, upload.array('recipeImage', 6), async (req, res) => { // Protected
      try {
        // Add user ID to the recipe object
        const userId = req.user._id;
        //setup initial variables to be used in recipe object
        let title = req.body.title;
        let favourite = req.body.favourite; 
        let isImg = false;
        let isLink = false;
        let recipeUrl = "noUrl";
        let images = undefined;
        let steps = [];
        let ingredients = [];
        let keysArray = Object.keys(req.body);
        let valuesArray = Object.values(req.body);
        let categories = undefined;

        if (req.body.categories) {
          categories = req.body.categories.split(",");
        }

        //Redirect back to page with error message if this recipe name already exists
        // Consider scoping this check to the user? Or keep titles globally unique? Currently global.
        let result = await recipes.findOne({ title: title, userId:userId });
        if (result !== null) {
          res.render("newRecipe", { recipeExists: true, isLink: false, isImg: false })
          return
        }

        //Determine if there are any images and compress them
        if (!req.body.isImg && req.files.length == 1) {
          images = await sharp(req.files[0].buffer)
            .resize(1400)
            .jpeg({ quality: 80 })
            .toBuffer();
        }
        if (req.body.isImg) {
          isImg = true;
          images = await Promise.all(req.files.map(async (file) => {
            return await sharp(file.buffer)
              .resize(1400)
              .jpeg({ quality: 80 })
              .toBuffer();
          }));
        };

        //If there is a link, set it as the url
        if (req.body.link) {
          recipeUrl = req.body.link;
          isLink = true;
        }

        //Find steps and ingredients through key value pairs if they exist
        for (i = 0; i < keysArray.length; i++) {
          if (keysArray[i].includes("step")) {
            steps.push(valuesArray[i]);
          }
          if (keysArray[i].includes("ingredient")) {
            ingredients.push(valuesArray[i]);
          }
        }

        //Add the recipe into the recipe collection on mongoDB
        const newRecipeDoc = {
          title: req.body.title,
          // favourite:false, // Obsolete
          isImg: isImg,
          isLink: isLink,
          recipeUrl: recipeUrl,
          images: images,
          description: req.body.description,
          steps: steps,
          ingredients: ingredients,
          categories: categories,
          userId: userId // Store the user ID
        };
        await recipes.insertOne(newRecipeDoc);

     
        if (!!req.body.favourite) {
           await userFavourites.insertOne({ userId: userId, recipeId: newRecipeDoc._id });
        }


        if (isImg) {
          res.redirect("recipeIMG/" + req.body.title)
        } else if (isLink) {
          res.redirect("recipeList")
        } else {
          res.redirect("recipe/" + req.body.title);
        }

      } catch (err) {
        console.error("Error creating new recipe:", err);
        res.status(500).send('Error creating recipe');
      }
    })


    //Convert a link to a Recipe
    app.post('/convertRecipe', ensureAuthenticated, async (req, res) => { // Protected
      try {
        // Add user ID to the recipe object
        const userId = req.user._id;
        //use recipeScraper to generate recipe from URL
        const url = req.body.link;
        let recipeData = await recipeScraper(url).then(recipe => { return recipe }); // Renamed variable
        let favourite = req.body.favourite; 
        let categories = undefined;
        if (req.body.categories) {
          categories = req.body.categories.split(",");
        }


        //Check if recipe title already exists in DB (globally or per user?) - Currently global
        let result = await recipes.findOne({ title: recipeData.name, userId: userId });
        if (result !== null) {
          console.log("recipeExists");
          res.render("convertRecipe", { recipeExists: true, recipeSiteError: false }) // Pass recipeSiteError:false
          return
        } else {

          //Use axios to grab image from the recipe, then use sharp to compress it
          let imageBuffer = null; // Default to null
          if (recipeData.image) { // Check if image URL exists
            try {
              let image = await axios({
                method: 'get',
                url: recipeData.image,
                responseType: 'arraybuffer'
              });
              imageBuffer = await sharp(image.data)
                .resize(1400)
                .jpeg({ quality: 80 })
                .toBuffer();
            } catch (imgError) {
              console.error("Failed to fetch or process recipe image:", imgError.message);
              // Continue without image if fetching/processing fails
            }
          }


          //Add recipe
          const newRecipeDoc = {
            title: recipeData.name,
            isImg: false, // Converted recipes are not image recipes by default
            isLink: false, // Converted recipes are not link recipes by default
            recipeUrl: "noUrl", // Store original URL? Maybe add a sourceUrl field?
            description: recipeData.description,
            images: imageBuffer, // Use processed image buffer (or null)
            ingredients: recipeData.ingredients,
            steps: recipeData.instructions,
            categories: categories,
            userId: userId // Store the user ID
          };
          await recipes.insertOne(newRecipeDoc);

          
           if (!!req.body.favourite) {
              await userFavourites.insertOne({ userId: userId, recipeId: newRecipeDoc._id });
          }

          res.redirect('recipe/' + recipeData.name);
        }
      } catch (err) {
        console.log("Error converting recipe:", err); // Log the actual error
        res.render('convertRecipe', { recipeSiteError: true, recipeExists: false })
      }
    })

    // Favourite submission - Adds/removes a recipe from the user's favourites
    app.post('/favouriteRecipe', ensureAuthenticated, async (req, res) => { // Protected & User-Specific
      try {
        const userId = req.user._id;
        const recipeTitle = req.body.title;

        // Find the recipe document to get its ID
        const recipe = await recipes.findOne({ title: recipeTitle });
        if (!recipe) {
          return res.status(404).send('Recipe not found'); // Or handle error differently
        }
        const recipeId = recipe._id;

        // Check if the user has already favourited this recipe
        const existingFavourite = await userFavourites.findOne({ userId: userId, recipeId: recipeId });

        if (existingFavourite) {
          // Already favourited, so remove it
          await userFavourites.deleteOne({ _id: existingFavourite._id });
          res.json({ favourited: false }); // Send response back to client JS if needed
        } else {
          // Not favourited, so add it
          await userFavourites.insertOne({ userId: userId, recipeId: recipeId });
          res.json({ favourited: true }); // Send response back to client JS if needed
        }
        // If not using client-side JS to update the heart, you might just send a 200 OK
        // res.sendStatus(200);

      } catch (err) {
        console.error("Error updating favourite status:", err);
        res.status(500).send('Error updating favourite status');
      }
    });


    //Edit recipe, ensuring ownership before update
    app.post("/recipe/:title/editRecipe", ensureAuthenticated, upload.single('recipeImage'), async (req, res) => { // Protected & User-Specific Check
      try {
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

        if (req.body.categories) {
          categories = req.body.categories.split(",")
        }

        //Add all steps and ingredients into an array to be stored in the database
        let keysArray = Object.keys(req.body);
        let valuesArray = Object.values(req.body);

        for (i = 0; i < keysArray.length; i++) {
          if (keysArray[i].includes("step")) {
            steps.push(valuesArray[i]);
          }
          if (keysArray[i].includes("ingredient")) {
            ingredients.push(valuesArray[i]);
          }
        }

        // Prepare update object
        const updateData = {
          "title": req.body.title,
          "recipeUrl": req.body.link || "noUrl",
          "description": req.body.description,
          "steps": steps,
          "ingredients": ingredients,
          // "favourite":!!req.body.favourite, // Obsolete - remove if still present
          "categories": categories
        };


        //If there is a new thumbnail, compress and store it in the update object
        if (req.file) {
          let imageBuffer = await sharp(req.file.buffer)
            .resize(1400)
            .jpeg({ quality: 80 })
            .toBuffer();
          updateData.images = imageBuffer; // Add/overwrite images field
        }

        // Update the recipe using its _id
        await recipes.updateOne({ _id: originalRecipe._id }, { $set: updateData });

        // Handle favourite checkbox if added to edit form
        // const shouldBeFavourite = !!req.body.favourite;
        // const isFavourite = await userFavourites.findOne({ userId: userId, recipeId: originalRecipe._id });
        // if (shouldBeFavourite && !isFavourite) {
        //     await userFavourites.insertOne({ userId: userId, recipeId: originalRecipe._id });
        // } else if (!shouldBeFavourite && isFavourite) {
        //     await userFavourites.deleteOne({ _id: isFavourite._id });
        // }


        // Redirect based on the *new* title
        if (req.body.link || req.body.isImg) { // isImg might be obsolete here if edit form doesn't change type
          res.redirect("/recipeList");
        } else {
          res.redirect("/recipe/" + req.body.title); // Use the new title
        }
      } catch (err) {
        console.error("Error editing recipe:", err);
        res.status(500).send('Error editing recipe');
      }
    })

    //Find recipe and delete it entirely, ensuring ownership
    app.post('/deleteRecipe', ensureAuthenticated, async (req, res) => { // Protected & User-Specific Check
      try {
        const userId = req.user._id;
        const titleToDelete = req.body.title;

        // Verify ownership before deleting
        const recipeToDelete = await recipes.findOne({ title: titleToDelete, userId:userId });
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
        const recipeIdToDelete = recipeToDelete._id;
        await recipes.deleteOne({ _id: recipeIdToDelete });

        // Also remove associated favourites and shopping list items
        await userFavourites.deleteMany({ recipeId: recipeIdToDelete });
        await userShoppingList.deleteMany({ recipeId: recipeIdToDelete });

        res.redirect("/recipeList");
      } catch (err) {
        console.error("Error deleting recipe:", err);
        res.status(500).send('Error deleting recipe');
      }
    });


    //Search Recipe by Title or Ingredient (Should this be user-specific?)
    // Current implementation searches globally. Modify if needed.
    app.post('/search', ensureAuthenticated, async (req, res) => { // Added ensureAuthenticated
      try {
        const userId = req.user._id; // Get current user ID if needed for filtering
        const searchTerm = req.body.search;

        // Example: Modify to search only user's recipes
        // const query = {
        //    userId: userId,
        //    $or: [
        //        { "title": { "$regex": "\\b" + searchTerm + "\\b", "$options": "i" } },
        //        { "ingredients": { "$regex": "\\b" + searchTerm + "\\b", "$options": "i" } },
        //        { "categories": { "$regex": "\\b" + searchTerm + "\\b", "$options": "i" } }
        //    ]
        // };
        // let recipeList = await recipes.find(query).toArray();

        // Current global search:
        let byTitle = await recipes.find({ "title": { "$regex": "\\b" + searchTerm + "\\b", "$options": "i" } }).toArray();
        let byIngredient = await recipes.find({ "ingredients": { "$regex": "\\b" + searchTerm + "\\b", "$options": "i" } }).toArray();
        let byCategory = await recipes.find({ "categories": { "$regex": "\\b" + searchTerm + "\\b", "$options": "i" } }).toArray();

        let combinedArray = byTitle.concat(byIngredient).concat(byCategory);
        let uniqueRecipeMap = new Map();
        combinedArray.forEach(recipe => uniqueRecipeMap.set(recipe._id.toString(), recipe));
        let recipeList = Array.from(uniqueRecipeMap.values());

        // Add favourite status for the current user to search results
        const favouriteEntries = await userFavourites.find({ userId: userId }, { projection: { recipeId: 1 } }).toArray();
        const favouriteRecipeIds = new Set(favouriteEntries.map(fav => fav.recipeId.toString()));
        recipeList = recipeList.map(recipe => ({
          ...recipe,
          isCurrentUserFavourite: favouriteRecipeIds.has(recipe._id.toString())
        }));


        recipeList.sort((a, b) => a.title.localeCompare(b.title));
        res.render('recipeList', { recipeList: recipeList, favourites: false }) // Pass currentUser implicitly
      } catch (err) {
        console.log("Search error:", err);
        res.status(500).send('Error during search');
      }
    });

    // Toggle recipe on/off shopping list for the current user
    app.post('/shoppingList', ensureAuthenticated, async (req, res) => { // Protected & User-Specific
      try {
        const userId = req.user._id;
        const recipeTitle = req.body.title;

        // Find the recipe document to get its ID
        const recipe = await recipes.findOne({ title: recipeTitle });
        if (!recipe) {
          return res.status(404).send('Recipe not found');
        }
        // Optional: Check if user owns recipe before adding to list?
        // if (!recipe.userId || recipe.userId.toString() !== userId.toString()) {
        //    return res.status(403).send('Cannot add another user recipe to list');
        // }
        const recipeId = recipe._id;


        // Check if the user already has this recipe on their list
        const existingItem = await userShoppingList.findOne({ userId: userId, recipeId: recipeId });

        if (existingItem) {
          // Already on list, so remove it
          await userShoppingList.deleteOne({ _id: existingItem._id });
          res.json({ onList: false }); // Send response back to client JS if needed
        } else {
          // Not on list, so add it
          await userShoppingList.insertOne({ userId: userId, recipeId: recipeId });
          res.json({ onList: true }); // Send response back to client JS if needed
        }
        // If not using client-side JS to update, just send 200 OK
        // res.sendStatus(200);

      } catch (err) {
        console.error("Error updating shopping list status:", err);
        res.status(500).send('Error updating shopping list status');
      }
    });

    // Clear the shopping list for the current user
    app.post("/deleteShop", ensureAuthenticated, async (req, res) => { // Protected & User-Specific
      try {
        const userId = req.user._id;
        // Delete all entries from userShoppingList for the current user
        await userShoppingList.deleteMany({ userId: userId });
        res.redirect("shoppingList");
      } catch (err) {
        console.error("Error clearing shopping list:", err);
        res.status(500).send('Error clearing shopping list');
      }
    });


    //Initiate Express listening on port
    app.listen(port, () => {
      console.log(`Example app listening on port ${port}`)
      console.log("This is a test console log!"); // Added test log
    })
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close(); // Consider if/when to close the client connection
  }
}
run().catch(console.dir);
