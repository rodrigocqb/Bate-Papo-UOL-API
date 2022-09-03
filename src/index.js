import express from "express";
import cors from "cors";
import { MongoClient, ObjectId } from "mongodb";
import joi from "joi";
import dotenv from "dotenv";
import dayjs from "dayjs";
import { stripHtml } from "string-strip-html";
dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const mongoClient = new MongoClient(process.env.MONGO_URI);
let db;
mongoClient.connect().then(() => {
  db = mongoClient.db("bate_papo_uol");
});

const userSchema = joi.object({
  name: joi.string().required(),
});

const messageSchema = joi.object({
  to: joi.string().required(),
  text: joi.string().required(),
  type: joi.string().valid("message", "private_message").required(),
});

async function alreadyExists(participant) {
  const exists = await db
    .collection("participants")
    .findOne({ name: participant });
  return exists;
}

function filterMessages(user, message) {
  return (
    message.type === "message" ||
    message.type === "status" ||
    message.to === user ||
    message.from === user
  );
}

async function removeInactive() {
  const users = await db.collection("participants").find().toArray();
  const inactiveUsers = users.filter((user) => {
    const now = Date.now();
    return now - user.lastStatus > 10000;
  });
  return inactiveUsers;
}

setInterval(async () => {
  const inactiveUsers = await removeInactive();
  inactiveUsers.forEach(async (user) => {
    const now = Date.now();
    await db.collection("participants").deleteOne({ _id: user._id });
    await db.collection("messages").insertOne({
      from: user.name,
      to: "Todos",
      text: "sai da sala...",
      type: "status",
      time: dayjs(now).format("HH:mm:ss"),
    });
  });
}, 15000);

app.post("/participants", async (req, res) => {
  let { name } = req.body;
  name = stripHtml(name).result.trim();
  const validation = userSchema.validate({ name }, { abortEarly: true });
  if (validation.error) {
    const error = validation.error.details[0].message;
    res.status(422).send(error);
    return;
  }
  try {
    const exists = await alreadyExists(name);
    if (exists) {
      res.sendStatus(409);
      return;
    }

    const now = Date.now();
    await db.collection("participants").insertOne({ name, lastStatus: now });
    await db.collection("messages").insertOne({
      from: name,
      to: "Todos",
      text: "entra na sala...",
      type: "status",
      time: dayjs(now).format("HH:mm:ss"),
    });
    res.sendStatus(201);
  } catch (error) {
    res.status(500).send(error);
  }
});

app.get("/participants", async (req, res) => {
  try {
    const participants = await db.collection("participants").find().toArray();
    res.send(participants);
  } catch (error) {
    res.status(500).send(error);
  }
});

app.post("/messages", async (req, res) => {
  let from = req.headers.user;
  from = stripHtml(from).result.trim();
  let { to, text, type } = req.body;
  to = stripHtml(to).result.trim();
  text = stripHtml(text).result.trim();
  type = stripHtml(type).result.trim();
  try {
    const exists = await alreadyExists(from);
    const validation = messageSchema.validate(
      { to, text, type },
      { abortEarly: false }
    );
    if (validation.error || !exists) {
      let errors;
      if (validation.error) {
        errors = validation.error.details.map((detail) => detail.message);
      }
      if (!exists) {
        errors.push("O usuário não está logado!");
      }
      res.status(422).send(errors);
      return;
    }

    const now = Date.now();
    await db
      .collection("messages")
      .insertOne({ from, to, text, type, time: dayjs(now).format("HH:mm:ss") });
    res.sendStatus(201);
  } catch (error) {
    res.status(500).send(error);
  }
});

app.get("/messages", async (req, res) => {
  const limit = parseInt(req.query.limit);
  let user = req.headers.user;
  user = stripHtml(user).result.trim();
  try {
    const messages = await db.collection("messages").find().toArray();
    const filteredMessages = messages.filter((message) =>
      filterMessages(user, message)
    );
    if (limit > 0) {
      res.send(filteredMessages.slice(-limit));
      return;
    }
    res.send(filteredMessages);
  } catch (error) {
    res.status(500).send(error);
  }
});

app.post("/status", async (req, res) => {
  let user = req.headers.user;
  user = stripHtml(user).result.trim();
  try {
    const exists = await alreadyExists(user);
    if (!exists) {
      res.sendStatus(404);
      return;
    }

    const now = Date.now();
    await db
      .collection("participants")
      .updateOne({ name: user }, { $set: { lastStatus: now } });
    res.sendStatus(200);
  } catch (error) {
    res.status(500).send(error);
  }
});

app.delete("/messages/:id", async (req, res) => {
  const { id } = req.params;
  let user = req.headers.user;
  user = stripHtml(user).result.trim();
  try {
    const message = await db
      .collection("messages")
      .findOne({ _id: ObjectId(id) });
    if (!message) {
      res.sendStatus(404);
      return;
    }
    if (message.from !== user) {
      res.sendStatus(401);
      return;
    }
    await db.collection("messages").deleteOne({ _id: ObjectId(id) });
    res.sendStatus(204);
  } catch (error) {
    res.status(500).send(error);
  }
});

app.put("/messages/:id", async (req, res) => {
  const { id } = req.params;
  let user = req.headers.user;
  user = stripHtml(user).result.trim();
  try {
    const message = await db
      .collection("messages")
      .findOne({ _id: ObjectId(id) });
    if (!message) {
      res.sendStatus(404);
      return;
    }
    if (message.from !== user) {
      res.sendStatus(401);
      return;
    }

    let { to, text, type } = req.body;
    to = stripHtml(to).result.trim();
    text = stripHtml(text).result.trim();
    type = stripHtml(type).result.trim();
    const exists = await alreadyExists(user);
    const validation = messageSchema.validate(
      { to, text, type },
      { abortEarly: false }
    );
    if (validation.error || !exists) {
      let errors;
      if (validation.error) {
        errors = validation.error.details.map((detail) => detail.message);
      }
      if (!exists) {
        errors.push("O usuário não está logado!");
      }
      res.status(422).send(errors);
      return;
    }
    await db
      .collection("messages")
      .updateOne({ _id: ObjectId(id) }, { $set: { to, text, type } });
    res.sendStatus(204);
  } catch (error) {
    res.status(500).send(error);
  }
});

app.listen(5000, () => console.log("Listening on port 5000!"));
