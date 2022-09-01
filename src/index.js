import express from "express";
import cors from "cors";
import { MongoClient } from "mongodb";

import dotenv from "dotenv";
import dayjs from "dayjs";
dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const mongoClient = new MongoClient(process.env.MONGO_URI);
let db;
mongoClient.connect().then(() => {
  db = mongoClient.db("bate_papo_uol");
});

app.post("/participants", async (req, res) => {
  const { name } = req.body;
  if (!name) {
    res.sendStatus(422);
    return;
  }
  const alreadyExists = await db
    .collection("participants")
    .findOne({ name: name });
  if (alreadyExists) {
    res.sendStatus(409);
    return;
  } else {
    try {
      const now = Date.now();
      await db
        .collection("participants")
        .insertOne({ name: name, lastStatus: now });
      await db.collection("messages").insertOne({
        from: name,
        to: "Todos",
        text: "entra na sala...",
        type: "status",
        time: dayjs(now).format("HH:mm:ss"),
      });
      res.sendStatus(201);
    } catch (error) {
      console.log(error);
      res.sendStatus(500);
    }
  }
});

app.get("/participants", async (req, res) => {
  try {
    const participants = await db.collection("participants").find().toArray();
    res.send(participants);
  } catch (error) {
    console.log(error);
    res.sendStatus(500);
  }
});

app.listen(5000, () => console.log("Listening on port 5000!"));
