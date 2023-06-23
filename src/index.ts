import * as dotenv from "dotenv";
dotenv.config();

import express from "express";
import { FocusingManagerRouter } from "./routes/routes";

const PORT = parseInt(process.env.SERVER_PORT as string) || 3000;

const app = express();

app.use(express.json( {limit: '150kb'} ));


app.use((req, res, next) => {
  if (req.originalUrl != "/metrics") {
    console.log(`\n\n${new Date().toLocaleString()} | Method: ${req.method} | URL: ${req.originalUrl}`);
  }
  next()
})

app.use("/", FocusingManagerRouter);
app.listen(PORT, () => {
  console.log(`Focusing manager listening on port ${PORT}`);
});
