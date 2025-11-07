// server.js
const express = require("express");


;



const app = express();


// health + simple GET
app.get("/health", (_req, res) => res.status(200).send("OK"));
app.get("/", (_req, res) => res.status(200).send("It works"));



const PORT = 3000;
app.listen(PORT, async () => {
    console.log(`HTTP server listening on :${PORT}`);

});
