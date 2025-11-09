// server.js
const express = require("express");
const app = express();

// Allow JSON body (optional but useful)
app.use(express.json());

// Basic homepage route
app.get("/", (req, res) => {
    res.send("Server is running!");
});

// A test POST endpoint
app.post("/test", (req, res) => {
    res.send("It works");
});

// Render/production needs this
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});
