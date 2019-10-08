import express from "express";
import User from "../models/user";
import BookCollection from "../models/book-collection";
import parseErrors from "../utils/parse-errors";
import { sendConfirmationEmail } from "../mailer";
import authenticate from "../middlewares/authenticate";

const router = express.Router();

router.post("/", (req, res) => {
  const { username, email, password } = req.body.user;
  const user = new User({
    username,
    email
  });

  user.setPassword(password);
  user.setConfirmationToken();
  user
    .save()
    .then(userRecord => {
      sendConfirmationEmail(userRecord);
      res.json({
        user: userRecord.toAuthJSON()
      });
    })
    .catch(err =>
      res.status(400).json({
        errors: parseErrors(err.errors)
      })
    );

  BookCollection.create({ list: [] }).then(collection => {
    User.findOneAndUpdate(
      { _id: user._id },
      { bookCollectionId: collection._id },
      { new: true }
    ).then(result => {
      if (!result) {
        res.status(400).json({});
      }
    });
  });
});

router.get("/current_user", authenticate, (req, res) => {
  res.json({
    user: {
      username: req.currentUser.username,
      email: req.currentUser.email,
      confirmed: req.currentUser.confirmed
    }
  });
});

export default router;
