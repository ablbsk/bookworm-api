import express from "express";
import request from "request-promise";
import mongoose from 'mongoose';
import { parseString } from "xml2js";
import authenticate from "../middlewares/authenticate";
import Book from "../models/book";
import BookCollection from "../models/book-collection";
import parseErrors from "../utils/parse-errors";

const router = express.Router();
router.use(authenticate);

router.get('/', (req, res) => {
  BookCollection.findById(req.currentUser.bookCollectionId)
    .then(collection => {
      const bookList = collection.list;
      const ids = bookList.map(item => item.bookId);
      Book.find({ _id: { $in: ids } })
        .then(books => {
          res.json({ books })
        });
    })
});

router.post("/", (req, res) => {
  const { bookCollectionId } = req.currentUser;
  Book.create({
    ...req.body.book
  })
    .then(book => {
      BookCollection.findOneAndUpdate(
        { _id: bookCollectionId },
        { $push: {
          list: {
            bookId: book._id,
            readPages: 0
          }
        } },
        { new: true }
      ).then(result => {
        if (!result) {
          res.status(400).json({});
        }
      });
      return res.json({ book });
    })
    .catch(err => {
      res.status(400).json({ errors: parseErrors(err.errors) });
    });
});

router.post("/delete_book", (req, res) => {
  Book.findByIdAndRemove(req.body.id)
    .then(() => {
      BookCollection.findByIdAndUpdate(
        req.currentUser.bookCollectionId,
        { $pull: { list: { bookId: new mongoose.Types.ObjectId(req.body.id) } } }
      )
        .then(collection => {
          res.json({ collection })
        });
    })
    .catch(err => {
      res.status(400).json({ errors: parseErrors(err.errors) });
  });
});

router.get("/search", (req, res) => {
  request
    .get(
      `https://www.goodreads.com/search/index.xml?key=FJ8QTTCeXMYySmerRew60g&q=${req.query.q}`
    )
    .then(result =>
      parseString(result, (err, goodreadsResult) =>
        res.json({
          books: goodreadsResult.GoodreadsResponse.search[0].results[0].work.map(
            work => ({
              goodreadsId: work.best_book[0].id[0]._,
              title: work.best_book[0].title[0],
              authors: work.best_book[0].author[0].name[0],
              covers: [work.best_book[0].image_url[0]]
            })
          )
        })
      )
    );
});

router.get("/fetchPages", (req, res) => {
  const { goodreadsId } = req.query;
  request
    .get(
      `https://www.goodreads.com/book/show.xml?key=FJ8QTTCeXMYySmerRew60g&id=${goodreadsId}`
    )
    .then(result =>
      parseString(result, (err, goodreadsResult) => {
        const objPath = goodreadsResult.GoodreadsResponse.book[0];
        const numPages = objPath.num_pages[0];
        const pages = numPages ? parseInt(numPages, 10) : 0;
        res.json({
          pages
        });
      })
    );
});

export default router;
