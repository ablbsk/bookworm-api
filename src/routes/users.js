import express from 'express';
import User from '../models/user';
import parseErrors from '../utils/parse-errors';

const router = express.Router();

router.post('/', (req, res) => {
  const { email, password } = req.body.user;
  const user = new User({
    email
  });
  user.setPassword(password);
  user
    .save()
    .then(userRecord => res.json({
      user: userRecord.toAuthJSON()
    }))
    .catch(err => res.status(400).json({
      errors: parseErrors(err.errors)
    }));
});

export default router;
