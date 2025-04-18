//Requires
const express = require("express");
const ejs = require("ejs");
const bodyParser = require('body-parser');
const axios = require('axios');
const recipeScraper = require("@brandonrjguth/recipe-scraper");
const fs = require('fs').promises; // Use the promises API
const path = require('path');
const sharp = require('sharp');
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


    app.get('/', (req, res) => {
      res.redirect('recipeList');
    })


    //Demo route logs in a demoUser, deletes all recipes tied to the demoUser and then reseeds example recipes
    //This is purely for showing off the app, allows the user to edit, favourite, delete and add but resets whenever the route is called
    app.get('/demo', async (req, res) => {
      const demoUsername = 'demoUser';
      const demoPassword = 'password123';
      let demoUserId;
      let demoUserObject;

      try {
          console.log("Attempting demo user setup...");
          // 1. Find or Create Demo User
          demoUserObject = await users.findOne({ username: demoUsername });

          if (!demoUserObject) {
              console.log(`Demo user "${demoUsername}" not found, creating...`);
              const saltRounds = 10;
              const hashedPassword = await bcrypt.hash(demoPassword, saltRounds);
              const newUser = { username: demoUsername, password: hashedPassword };
              const insertResult = await users.insertOne(newUser);
              demoUserId = insertResult.insertedId;
              demoUserObject = await users.findOne({ _id: demoUserId });
               if (!demoUserObject) {
                  throw new Error("Failed to fetch newly created demo user.");
               }
              console.log(`Demo user "${demoUsername}" created with ID: ${demoUserId}`);
          } else {
              demoUserId = demoUserObject._id;
              console.log(`Demo user "${demoUsername}" found with ID: ${demoUserId}`);
          }

          // 2. Clear Existing Demo Data
          console.log(`Clearing data for demo user ID: ${demoUserId}`);
          await recipes.deleteMany({ userId: demoUserId });
          await userFavourites.deleteMany({ userId: demoUserId });
          await userShoppingList.deleteMany({ userId: demoUserId });
          console.log("Demo user data cleared.");

          // 3. Read and Process Seed Images
          let carbonaraImgBuffer, stirfryImgBuffer, cookiesImgBuffer;
          try {
              carbonaraImgBuffer = await sharp(await fs.readFile(path.join(__dirname, 'public/imgs/carbonara.png'))).resize(1400).jpeg({ quality: 80 }).toBuffer();
              carbonaraThumbBuffer = await sharp(await fs.readFile(path.join(__dirname, 'public/imgs/carbonara.png'))).resize(400).jpeg({ quality: 80 }).toBuffer();
          } catch (e) { console.error("Error processing carbonara.png:", e.message); carbonaraImgBuffer = null; }
          try {
              friedChickenImgBuffer = await sharp(await fs.readFile(path.join(__dirname, 'public/imgs/fried-chicken.jpg'))).resize(1400).jpeg({ quality: 80 }).toBuffer();
              friedChickenThumbBuffer = await sharp(await fs.readFile(path.join(__dirname, 'public/imgs/fried-chicken.jpg'))).resize(400).jpeg({ quality: 80 }).toBuffer();
          } catch (e) { console.error("Error processing stirfry.png:", e.message); stirfryImgBuffer = null; }
          try {
              cookiesImgBuffer = await sharp(await fs.readFile(path.join(__dirname, 'public/imgs/Chocolate-Chip-Cookies.png'))).resize(1400).jpeg({ quality: 80 }).toBuffer();
              cookiesThumbBuffer = await sharp(await fs.readFile(path.join(__dirname, 'public/imgs/Chocolate-Chip-Cookies.png'))).resize(400).jpeg({ quality: 80 }).toBuffer();
            } catch (e) { console.error("Error processing Chocolate-Chip-Cookies.png:", e.message); cookiesImgBuffer = null; }


          // 4. Define Sample Recipes with Images
          const sampleRecipes = [
              {
                  title: "Pasta Carbonara",
                  description: "A classic Roman pasta dish.",
                  ingredients: ["200g Spaghetti", "100g Pancetta or Guanciale", "2 large Eggs", "50g Pecorino Romano cheese", "Black Pepper"],
                  steps: ["Cook spaghetti.", "Fry pancetta until crisp.", "Whisk eggs and cheese.", "Combine pasta, pancetta fat, egg mixture off heat.", "Add pasta water if needed. Serve with pepper."],
                  categories: ["Pasta", "Italian", "Quick"],
                  images: carbonaraImgBuffer, // Assign processed buffer
                  thumbnail:carbonaraThumbBuffer,
                  userId: demoUserId,
                  isLink:false,
                  isImg:false,
                  recipeUrl:"noUrl"
              },
              {
                title: "Kentucky-Style Fried Chicken",
                description: "Crispy, seasoned fried chicken with a flavorful coating and juicy interior, inspired by Kentucky-style cooking.",
                ingredients: ["4 Chicken Thighs", "4 Chicken Drumsticks", "2 cups Buttermilk", "1 tbsp Hot Sauce", "2 cups All-Purpose Flour", "1 tbsp Paprika", "1 tbsp Garlic Powder", "1 tbsp Onion Powder", "1 tsp Salt", "1 tsp Black Pepper", "1 tsp Cayenne Pepper", "1 tsp Dried Thyme", "1 tsp Dried Oregano", "Oil for frying (vegetable or peanut oil)"],
                steps: ["In a bowl, mix buttermilk and hot sauce.", "Add chicken pieces to the buttermilk mixture and marinate for at least 2 hours, preferably overnight.", "In a separate bowl, combine flour, paprika, garlic powder, onion powder, salt, black pepper, cayenne pepper, thyme, and oregano.", "Heat oil in a deep fryer or large skillet to 350°F (175°C).", "Remove chicken from the buttermilk and dredge in the flour mixture, coating evenly.", "Fry chicken in hot oil for 12-15 minutes, turning occasionally, until golden brown and cooked through (internal temperature should reach 165°F or 75°C).", "Remove chicken and drain on paper towels."],
                categories: ["Fried", "Southern", "Chicken"],
                  images: friedChickenImgBuffer, 
                  thumbnail:friedChickenThumbBuffer,
                  userId: demoUserId,
                  isLink:false,
                  isImg:false,
                  recipeUrl:"noUrl"
              },
               {
                  title: "Chocolate Chip Cookies",
                  description: "Classic chewy chocolate chip cookies.",
                  ingredients: ["2 1/4 cups All-purpose Flour", "1 tsp Baking Soda", "1 tsp Salt", "1 cup Butter, softened", "3/4 cup Granulated Sugar", "3/4 cup Brown Sugar", "2 large Eggs", "1 tsp Vanilla Extract", "2 cups Chocolate Chips"],
                  steps: ["Preheat oven to 375°F (190°C).", "Combine dry ingredients.", "Cream butter and sugars.", "Beat in eggs and vanilla.", "Gradually add dry ingredients.", "Stir in chocolate chips.", "Drop rounded tablespoons onto ungreased baking sheets.", "Bake 9-11 minutes."],
                  categories: ["Dessert", "Cookies", "Baking"],
                  images: cookiesImgBuffer, 
                  thumbnail:cookiesThumbBuffer,
                  userId: demoUserId,
                  isLink:false,
                  isImg:false,
                  recipeUrl:"noUrl"
              }
          ];

          // 5. Seed Sample Recipes
          if (sampleRecipes.length > 0) {
              const insertManyResult = await recipes.insertMany(sampleRecipes);
              console.log(`Inserted ${insertManyResult.insertedCount} sample recipes for demo user.`);

              // Optionally favourite one of the seeded recipes
               const firstRecipe = await recipes.findOne({title: sampleRecipes[0].title, userId: demoUserId});
               if(firstRecipe) {
                   await userFavourites.insertOne({ userId: demoUserId, recipeId: firstRecipe._id });
                   console.log(`Favourited "${firstRecipe.title}" for demo user.`);
               }
          }

          // 6. Log In Demo User
          console.log("Logging in demo user...");
          req.login(demoUserObject, (err) => {
              if (err) {
                  console.error("Demo user login failed:", err);
                  return res.redirect('/login');
              }
              console.log("Demo user logged in successfully.");
              // 7. Redirect
              return res.redirect('/recipeList');
          });

      } catch (err) {
          console.error("Error during /demo route execution:", err);
          res.status(500).send("An error occurred during the demo setup.");
      }
  });

    // Favourites route - fetches recipes favourited by the current user
    app.get("/favourites", ensureAuthenticated, async (req, res) => { // Protected & User-Specific
      try {

        //get UserId from passport session
        const userId = req.user._id;

        //Pagination logic
        const page = parseInt(req.query.page) || 1; // Get page from query, default to 1
        const limit = parseInt(req.query.limit) || 12; // Get limit from query, default to 12
        const skip = (page - 1) * limit;

        // Find all favourite entries for the current user
        const favouriteEntries = await userFavourites.find({ userId: userId }).toArray();
        // Extract the recipe IDs
        const recipeIds = favouriteEntries.map(fav => fav.recipeId);
        const recipeObjectIds = recipeIds.map(id => typeof id === 'string' ? new ObjectId(id) : id);

        // Base query for favourite recipes
        const query = { _id: { $in: recipeObjectIds } };

        // Fetch the paginated recipe documents using the extracted IDs
        let recipeList = await recipes.find(query)
                                      .sort({ "title": 1 })
                                      .skip(skip)
                                      .limit(limit)
                                      .toArray();

        // Get the total count of favourite recipes for pagination controls
        const totalRecipes = await recipes.countDocuments(query);
        const totalPages = Math.ceil(totalRecipes / limit);

        // Get user's shopping list IDs for quick lookup
        const shoppingListEntries = await userShoppingList.find({ userId: userId }, { projection: { recipeId: 1 } }).toArray();
        const shoppingListRecipeIds = new Set(shoppingListEntries.map(item => item.recipeId.toString()));

        // Set isCurrentUSerFavourite flag to true for all recipes gathered by searching for favourites
        // This gets used to set the favourited symbol correctly
        recipeList = recipeList.map(recipe => ({
          ...recipe,

        //Use the shopping list recipe Ids and compare them to each recipe in the gathered favourite list
        //If its on the shopping list, set the flag for isOnCurrentUserList to true
        //This gets used again to set the shopping symbol correctly
          isCurrentUserFavourite: true, // Always true for favourites page
          isOnCurrentUserList: shoppingListRecipeIds.has(recipe._id.toString())
        }));

        res.render('recipeList', {
          recipeList: recipeList,
          favourites: true,
          currentPage: page,
          totalPages: totalPages,
          limit: limit,
          currentPath: req.path // Keep original path for potential other uses
        });
      } catch (err) {
        console.error("Error fetching favourites:", err);
        res.status(500).send('Error fetching favourites');
      }
    });

    app.get('/newRecipePage', ensureAuthenticated, (req, res) => { // Protected
      res.render('newRecipe', { recipeExists: false, isImg: false, isLink: false, currentPath: "/recipeFrom" }) // Pass currentPath
    })

    app.get('/convertRecipe', ensureAuthenticated, (req, res) => { // Protected
      console.log(req.path);
      res.render('convertRecipe', { recipeExists: false, recipeSiteError: false, currentPath: "/recipeFrom" }); // Pass currentPath
    })

    app.get('/newRecipeLink', ensureAuthenticated, (req, res) => { // Protected
      res.render('newRecipe', { recipeExists: false, isLink: true, isImg: false, currentPath: "/recipeFrom" }) // Pass currentPath
    })

    app.get('/newRecipePicture', ensureAuthenticated, (req, res) => { // Protected
      res.render('newRecipe', { recipeExists: false, isImg: true, isLink: false, currentPath: "/recipeFrom" }) // Pass currentPath
    })

    app.get('/recipeFrom', ensureAuthenticated, (req, res) => { // Protected
      res.render('recipeFrom', { recipeExists: false, currentPath: "/recipeFrom" }) // Pass currentPath
    })

    // Send paginated array of recipes belonging to the logged-in user to recipeList page, indicating favourite and shopping list status
    app.get('/recipeList', ensureAuthenticated, async (req, res) => { // Protected & User-Specific
      try {
        const userId = req.user._id;
        const page = parseInt(req.query.page) || 1; // Get page from query, default to 1
        const limit = parseInt(req.query.limit) || 12; // Get limit from query, default to 12
        const skip = (page - 1) * limit;

        // Base query for user's recipes
        const query = { userId: userId };

        // Get paginated user's recipes
        let recipeList = await recipes.find(query)
                                      .collation({ locale: "en" })
                                      .sort({ "title": 1 })
                                      .skip(skip)
                                      .limit(limit)
                                      .toArray();

        // Get the total count of user's recipes for pagination controls
        const totalRecipes = await recipes.countDocuments(query);
        const totalPages = Math.ceil(totalRecipes / limit);

        // Get user's favourite recipe IDs for quick lookup
        const favouriteEntries = await userFavourites.find({ userId: userId }, { projection: { recipeId: 1 } }).toArray();
        const favouriteRecipeIds = new Set(favouriteEntries.map(fav => fav.recipeId.toString()));

        // Get user's shopping list IDs for quick lookup
        const shoppingListEntries = await userShoppingList.find({ userId: userId }, { projection: { recipeId: 1 } }).toArray();
        const shoppingListRecipeIds = new Set(shoppingListEntries.map(item => item.recipeId.toString()));

        // Add favourite and shopping list status to each recipe on the current page
        recipeList = recipeList.map(recipe => ({
          ...recipe,
          isCurrentUserFavourite: favouriteRecipeIds.has(recipe._id.toString()),
          isOnCurrentUserList: shoppingListRecipeIds.has(recipe._id.toString())
        }));

        res.render('recipeList', {
          recipeList: recipeList,
          favourites: false,
          currentPage: page,
          totalPages: totalPages,
          limit: limit,
          currentPath: req.path // Keep original path for potential other uses
        });
      } catch (err) {
        console.error("Error fetching recipe list:", err);
        res.status(500).send('Error fetching recipe list');
      }
    });

    // Route for the supported sites page
    app.get('/supportedSites', ensureAuthenticated, (req, res) => { // Protected (ensure user is logged in to see it)
        try {
            res.render('supportedSites.ejs', { currentPath: req.path }); // Pass currentPath
        } catch (err) {
            console.error("Error rendering supported sites page:", err);
            res.status(500).send('Error displaying supported sites');
        }
    });

  //Find the recipe by title for the current user and render its page, adding favourite and shopping list status
  app.get("/recipe/:title", ensureAuthenticated, async(req, res) => { // Protected & User-Specific Fetch
    try{
      const userId = req.user._id;
      // Find the recipe matching title AND userId
      let fullRecipe = await recipes.findOne({title: req.params.title, userId: userId}); 

      if (!fullRecipe) {
        // Handle recipe not found for this user
        console.log(`Recipe "${req.params.title}" not found for user ${userId}`);
        return res.redirect('/recipeList'); 
      }

        // Check if the current user has favourited this recipe
        const isFavourite = await userFavourites.findOne({ userId: userId, recipeId: fullRecipe._id });
        fullRecipe.isCurrentUserFavourite = !!isFavourite; // Add favourite flag

        // Check if the current user has this recipe on their shopping list
        const isOnList = await userShoppingList.findOne({ userId: userId, recipeId: fullRecipe._id });
        fullRecipe.isOnCurrentUserList = !!isOnList; // Add shopping list flag
        console.log(fullRecipe.isOnCurrentUserList);

        res.render("recipe", { recipe: fullRecipe, currentPath: req.path }); // Pass currentPath
      } catch (err) {
        console.error("Error fetching recipe:", err);
        res.status(500).send('Error fetching recipe');
      }
    })

  //Find an image recipe by title FOR THE CURRENT USER and display its page, adding favourite  and shopping list status
  app.get("/recipeImg/:title", ensureAuthenticated, async(req, res) => { // Protected & User-Specific Fetch
    try{
      const userId = req.user._id;
       // Find the recipe matching title AND userId
      let fullRecipe = await recipes.findOne({title: req.params.title, userId: userId}); 
      
      if (!fullRecipe) {
         console.log(`Image Recipe "${req.params.title}" not found for user ${userId}`);
        return res.redirect('/recipeList');
      }

        // Check if the current user has favourited this recipe
        const isFavourite = await userFavourites.findOne({ userId: userId, recipeId: fullRecipe._id });
        fullRecipe.isCurrentUserFavourite = !!isFavourite; // Add flag to recipe object

        let imageNumber = fullRecipe.images ? fullRecipe.images.length : 0; // Handle case where images might be null/undefined
        res.render("recipeImg", { recipe: fullRecipe, imageNumber: imageNumber, currentPath: req.path }); // Pass currentPath
      } catch (err) {
        console.error("Error fetching image recipe:", err);
        res.status(500).send('Error fetching image recipe');
      }
    })

    //Send user to the editing page for the chosen recipe, ensuring ownership
    app.get('/recipe/:title/editRecipe', ensureAuthenticated, async (req, res) => { // Protected & User-Specific Check
      try {
        const userId = req.user._id;
        let recipe = await recipes.findOne({ title: req.params.title, userId:userId });

        if (!recipe) {
          return res.redirect('/recipeList');
        }
        if (!recipe.userId || recipe.userId.toString() !== userId.toString()) {
          console.log(`User ${userId} attempted to edit recipe owned by ${recipe.userId}`);
          return res.redirect('/recipeList');
        }

        const isFavourite = await userFavourites.findOne({ userId: userId, recipeId: recipe._id });
        recipe.isCurrentUserFavourite = !!isFavourite;

        res.render("editRecipe", { recipe: recipe, recipeExists: false, currentPath: req.path }); // Pass currentPath
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
        // Regular expression to match numbers, units, and fractions and common recipe terms. This is used to make a simplified list.
        let regex = /(\b\d+(\.\d+)?\/?\d*\s*)?(lbs?|oz|cans?|Tbsp|packed|diced|minced|tsp|\bcup\b|\btotal\b|cups|\bg\b|grams|handful|crushed|to garnish|low-fat|\d+g|\d+l|\d+ml|kg|knob|of|kilograms|\bml\b|\bl\b|liters|pinch|dash|cloves?|sprigs?|bunches?|slices?|sticks?|quarts?|pints?|gallons?|teaspoons?|grated|ground|jar|bunch|fresh|to taste|chopped|freshly|sliced|diced|tablespoons?|fluid\sounces?)\b|\.|^-|\s-|-\s|$|½|¼|¾|\b\d+\s+-\s+\d+\b|\b\d+-\d+\b|\b\d+\b|,|\/+|\(|\)|\*|\babout\b|\binch\b|\b-inch\b|\bpeeled\b|\band\b|\bvery\b|\bfinely\b|\bi\b|\buse\b|\bfrozen\b|\bready\b|\bprepared\b|\bor\b|\ba\b/gi;

  

        // Group ingredients by their cleaned name
        let groupedIngredients = {};
        ingredients.forEach(ingredient => {
            let cleaned = ingredient.replace(regex, '').trim().toLowerCase(); // Clean and lowercase for grouping
            if (!cleaned) return; // Skip empty ingredients after cleaning

            if (!groupedIngredients[cleaned]) {
                groupedIngredients[cleaned] = {
                    simplifiedName: cleaned.charAt(0).toUpperCase() + cleaned.slice(1), // Capitalize first letter for display
                    detailedItems: []
                };
            }
            groupedIngredients[cleaned].detailedItems.push(ingredient); // Add original detailed string
        });

        // Convert grouped object into an array and sort by simplified name
        let shoppingListData = Object.values(groupedIngredients).sort((a, b) =>
            a.simplifiedName.localeCompare(b.simplifiedName, undefined, { sensitivity: 'base' })
        );

        // Sort detailed items within each group (optional, but keeps original detailed sort logic somewhat)
        shoppingListData.forEach(group => {
            group.detailedItems.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
        });


        // Pass the structured data to the template
        res.render("shoppingList", { shoppingListData: shoppingListData, currentPath: req.path }); // Pass currentPath
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
      // For simplicity, we just render the view without flash messages for now.
      res.render('login', { error: null , currentPage:false, currentPath: req.path}); // Pass null initially
    });

    // Display registration page
    app.get('/register', (req, res) => {
      res.render('register', { error: null, currentPage:false, currentPath: req.path}); // Pass null initially
    });

    // Handle logout
    app.get('/logout', (req, res, next) => {
      req.logout(function (err) { // req.logout requires a callback function
        if (err) { return next(err); }
        res.redirect('/'); // Redirect to homepage after logout
      });
    });


    //--------------------- IMAGE SERVING ROUTES -----------------------------//

    // To-do: Add ownership checks here too? Maybe less critical if URL isn't easily guessable.
    
    //Pictures for a picture recipe
    app.get("/recipeImg/imgURL/:title/:number", async (req, res) => {
      try {
        let imageNumber = req.params.number;
        let fullRecipe = await recipes.findOne({ title: req.params.title })
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
        const img = fullRecipe.thumbnail;
        res.send(img.buffer);
      } catch (err) {
        console.error(err);
      }
    })

    //Full images for regular recipe hero
    app.get("/recipeImg/imgHeroURL/:title", async (req, res) => {
      try {
        let fullRecipe = await recipes.findOne({ title: req.params.title })
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
          return res.render('register', { error: 'All fields are required.', currentPath:req.path });
        }
        if (password !== passwordConfirm) {
          return res.render('register', { error: 'Passwords do not match.', currentPath:req.path });
        }

        // Check if user already exists
        const existingUser = await users.findOne({ username: username });
        if (existingUser) {
          return res.render('register', { error: 'Username already taken.', currentPath:req.path });
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
        res.render('register', { error: 'An error occurred during registration.', currentPath:req.path });
      }
    });

    // Handle login
    app.post('/login', passport.authenticate('local', {
      successRedirect: '/recipeList', // Redirect on successful login
      failureRedirect: '/login',     // Redirect back to login on failure
      // failureFlash: true // Requires connect-flash, not installed currently
    }), (req, res) => {
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

        //Redirect back to page with error message if this recipe name already exists for this user
        let result = await recipes.findOne({ title: title, userId:userId });
        if (result !== null) {
          res.render("newRecipe", { recipeExists: true, isLink: false, isImg: false, currentPage: false, currentPath:req.path })
          return
        }

        //Determine if there are any images and compress them
        if (!req.body.isImg && req.files.length == 1) {
          images = await sharp(req.files[0].buffer)
            .resize(1400)
            .jpeg({ quality: 75 })
            .toBuffer();
          thumbImageBuffer = await sharp(req.files[0].buffer)
          .resize(400)
          .jpeg({ quality: 75 })
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

          thumbImageBuffer = await sharp(req.files[0].buffer)
          .resize(400)
          .jpeg({ quality: 75 })
          .toBuffer();
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
          isImg: isImg,
          isLink: isLink,
          recipeUrl: recipeUrl,
          images: images,
          thumbnail:thumbImageBuffer,
          description: req.body.description,
          steps: steps,
          ingredients: ingredients,
          categories: categories,
          userId: userId 
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
        const userId = req.user._id;

        //use recipeScraper to generate recipe from URL
        const url = req.body.link;
        let recipeData = await recipeScraper(url).then(recipe => { return recipe }); // Renamed variable
        let favourite = req.body.favourite; 
        let categories = undefined;
        if (req.body.categories) {
          categories = req.body.categories.split(",");
        }


        //Check if recipe title already exists for this user in DB 
        let result = await recipes.findOne({ title: recipeData.name, userId: userId });
        if (result !== null) {
          console.log("recipeExists");
          res.render("convertRecipe", { recipeExists: true, recipeSiteError: false, currentPath:req.path }) // Pass recipeSiteError:false
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
              thumbImageBuffer = await sharp(image.data)
              .resize(400)
              .jpeg({ quality: 75 })
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
            recipeUrl: "noUrl", 
            description: recipeData.description,
            images: imageBuffer, 
            thumbnail: thumbImageBuffer,
            ingredients: recipeData.ingredients,
            steps: recipeData.instructions,
            categories: categories,
            userId: userId 
          };
          await recipes.insertOne(newRecipeDoc);

          
           if (!!req.body.favourite) {
              await userFavourites.insertOne({ userId: userId, recipeId: newRecipeDoc._id });
          }

          res.redirect('recipe/' + recipeData.name);
        }
      } catch (err) {
        console.log("Error converting recipe:", err); 
        res.render('convertRecipe', { recipeSiteError: true, recipeExists: false, currentPage: false, currentPath:req.path})
      }
    })

    // Favourite submission - Adds/removes a recipe from the user's favourites
    app.post('/favouriteRecipe', ensureAuthenticated, async (req, res) => { // Protected & User-Specific
      try {
        const userId = req.user._id;
        const recipeTitle = req.body.title;

        // Find the recipe document to get its ID
        const recipe = await recipes.findOne({ title: recipeTitle, userId:userId });
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
    app.post("/recipe/:title/editRecipe", ensureAuthenticated, upload.array('recipeImage', 6), async (req, res) => { // Protected & User-Specific Check
      
      try {
        const userId = req.user._id;
        const originalTitle = req.params.title;

        // Find the recipe document with title and current userId to get its ID
        const recipe = await recipes.findOne({ title: originalTitle, userId:userId});
        if (!recipe) {
          return res.status(404).send('Recipe not found'); // Or handle error differently
          return res.redirect('/recipeList'); // Or show an error
        }

        const recipeId = recipe._id;

        // Proceed with gathering updated data
        let steps = [];
        let ingredients = [];
        let categories = undefined;
        let favourite = req.body.favourite; 

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
          "categories": categories
        };

        // Check if the user has already favourited this recipe
        const existingFavourite = await userFavourites.findOne({ userId: userId, recipeId: recipeId }); 

        //If the recipe has been favourited and its not already a favourite then add.
        if (!!req.body.favourite && !existingFavourite) {
          await userFavourites.insertOne({ userId: userId, recipeId: recipeId });
        } 

        //If the recipe isn't favourited and it was a favourite, remove
        else if (!req.body.favourite && existingFavourite){
          await userFavourites.deleteOne({ _id: existingFavourite._id });
        }

        // Check if any new files were uploaded in this request
        if (req.files && req.files.length > 0) {
          console.log(`Processing ${req.files.length} uploaded file(s).`);
          if (recipe.isImg) {
              // If it's an image recipe and new files are uploaded, replace the entire array
              updateData.images = await Promise.all(req.files.map(async (file) => {
                  return await sharp(file.buffer)
                      .resize(1400)
                      .jpeg({ quality: 75 })
                      .toBuffer();
              }));
              updateData.thumbnail = await Promise.all(req.files.map(async (file) => {
                return await sharp(file.buffer)
                    .resize(400)
                    .jpeg({ quality: 75 })
                    .toBuffer();
            }));
              console.log("Updated images array for isImg recipe.");
          } else {
              // If it's a normal recipe and a new file is uploaded, replace the single image
              // upload.array gives req.files[0], even for single uploads
              updateData.images = await sharp(req.files[0].buffer)
                  .resize(1400)
                  .jpeg({ quality: 80 })
                  .toBuffer();
              updateData.thumbnail = await sharp(req.files[0].buffer)
              .resize(400)
              .jpeg({ quality: 75 })
              .toBuffer();


              console.log("Updated single image for normal recipe.");
          }
      } else {
          console.log("No new image files uploaded.");
          // If no files are uploaded, updateData.images remains unset,
          // so the $set operation won't touch the existing images field.
      }

        // Update the recipe using its _id
        await recipes.updateOne({ _id: recipe._id }, { $set: updateData });

        // Redirect based on the *new* title
        if (req.body.link) { // isImg might be obsolete here if edit form doesn't change type
          res.redirect("/recipeList");
        } else if (recipe.isImg){
          res.redirect("/recipeImg/" +req.body.title);
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

    // GET route for subsequent pages of search results
    app.get('/search', ensureAuthenticated, async (req, res) => {
      try {
        const userId = req.user._id;
        // Search term comes from the query string for GET requests
        const searchTerm = req.query.search || '';
        // Pagination parameters come from the query string
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 12;
        const skip = (page - 1) * limit;

        // Base query for user's recipes matching the search term
        const query = {
          userId: userId,
          $or: [
            { "title": { "$regex": searchTerm, "$options": "i" } },
            { "ingredients": { "$regex": searchTerm, "$options": "i" } },
            { "categories": { "$regex": searchTerm, "$options": "i" } }
          ]
        };

        // Get paginated search results
        let recipeList = await recipes.find(query)
                                      .collation({ locale: "en" })
                                      .sort({ "title": 1 })
                                      .skip(skip)
                                      .limit(limit)
                                      .toArray();

        // Get the total count of matching search results for pagination
        const totalRecipes = await recipes.countDocuments(query);
        const totalPages = Math.ceil(totalRecipes / limit);

        // Add favourite status for the current user to search results
        const favouriteEntries = await userFavourites.find({ userId: userId }, { projection: { recipeId: 1 } }).toArray();
        const favouriteRecipeIds = new Set(favouriteEntries.map(fav => fav.recipeId.toString()));

        // Get user's shopping list IDs for quick lookup
        const shoppingListEntries = await userShoppingList.find({ userId: userId }, { projection: { recipeId: 1 } }).toArray();
        const shoppingListRecipeIds = new Set(shoppingListEntries.map(item => item.recipeId.toString()));

        // Add favourite and shopping list status to each recipe
        recipeList = recipeList.map(recipe => ({
          ...recipe,
          isCurrentUserFavourite: favouriteRecipeIds.has(recipe._id.toString()),
          isOnCurrentUserList: shoppingListRecipeIds.has(recipe._id.toString())
        }));

        // Render the same list template, passing pagination and search term
        res.render('recipeList', {
          recipeList: recipeList,
          favourites: false, // Indicate it's not the favourites page
          currentPage: page,
          totalPages: totalPages,
          limit: limit,
          currentPath: '/search', // Use '/search' as the base path for pagination links
          searchTerm: searchTerm // Pass search term for pagination links
        });
      } catch (err) {
        console.error("Search GET error:", err); // Differentiate log message
        res.status(500).send('Error during search');
      }
    });


    // Search Recipe by Title, Ingredient, or Category with Pagination (Initial POST)
    app.post('/search', ensureAuthenticated, async (req, res) => {
      try {

        console.log("at search")
        console.log(req.body.search);
        const userId = req.user._id;
        // Search term comes from the POST body for the initial search
        const searchTerm = req.body.search || '';
        // Initial page is always 1 for a new POST search
        const page = 1; // Default to page 1 for initial POST search
        const limit = parseInt(req.query.limit) || 12; // Allow limit override if needed, but usually default
        const skip = (page - 1) * limit; // skip will be 0

        // Base query for user's recipes matching the search term
        const query = {
          userId: userId,
          $or: [
            { "title": { "$regex": searchTerm, "$options": "i" } },
            { "ingredients": { "$regex": searchTerm, "$options": "i" } },
            { "categories": { "$regex": searchTerm, "$options": "i" } }
          ]
        };

        // Get paginated search results
        let recipeList = await recipes.find(query)
                                      .collation({ locale: "en" }) // Keep collation for sorting consistency
                                      .sort({ "title": 1 })
                                      .skip(skip)
                                      .limit(limit)
                                      .toArray();

        // Get the total count of matching search results for pagination
        const totalRecipes = await recipes.countDocuments(query);
        const totalPages = Math.ceil(totalRecipes / limit);

        // Add favourite status for the current user to search results
        const favouriteEntries = await userFavourites.find({ userId: userId }, { projection: { recipeId: 1 } }).toArray();
        const favouriteRecipeIds = new Set(favouriteEntries.map(fav => fav.recipeId.toString()));

         // Get user's shopping list IDs for quick lookup
        const shoppingListEntries = await userShoppingList.find({ userId: userId }, { projection: { recipeId: 1 } }).toArray();
        const shoppingListRecipeIds = new Set(shoppingListEntries.map(item => item.recipeId.toString()));

        // Add favourite and shopping list status to each recipe
        recipeList = recipeList.map(recipe => ({
          ...recipe,
          isCurrentUserFavourite: favouriteRecipeIds.has(recipe._id.toString()),
          isOnCurrentUserList: shoppingListRecipeIds.has(recipe._id.toString())
        }));

        // Render the same list template, passing pagination and search term
        res.render('recipeList', {
          recipeList: recipeList,
          favourites: false, // Indicate it's not the favourites page
          currentPage: page,
          totalPages: totalPages,
          limit: limit,
          currentPath: '/search', // Use '/search' as the base path for pagination links
          searchTerm: searchTerm // Pass search term for pagination links
        });
      } catch (err) {
        console.error("Search POST error:", err); // Differentiate log message
        res.status(500).send('Error during search');
      }
    });


    // Toggle recipe on/off shopping list for the current user
    app.post('/shoppingList', ensureAuthenticated, async (req, res) => { // Protected & User-Specific
      try {
        const userId = req.user._id;
        const recipeTitle = req.body.title;

        // Find the recipe document to get its ID
        const recipe = await recipes.findOne({ title: recipeTitle, userId:userId});
        
        if (!recipe) {
          return res.status(404).send('Recipe not found');
        }
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
