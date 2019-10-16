import express from "express";
import request from "request-promise";
import mongoose from "mongoose";
import { parseString } from "xml2js";
import authenticate from "../middlewares/authenticate";
import Book from "../models/book";
import BookCollection from "../models/book-collection";
import parseErrors from "../utils/parse-errors";

const router = express.Router();
router.use(authenticate);

router.get("/", (req, res) => {
  BookCollection.findById(req.currentUser.bookCollectionId).then(collection => {
    const bookList = collection.list;
    const ids = bookList.map(item => item.bookId);
    Book.find({ _id: { $in: ids } }).then(books => {
      res.json({ books });
    });
  });
});

router.post("/", (req, res) => {
  const { bookCollectionId } = req.currentUser;

  Book.findOne({ goodreadsId: req.body.book.goodreadsId }).then(function(book) {
    if (book) {
      bookCollectionUpdate(book);
      updateNumOfEntities(book);
    } else {
      Book.create({ ...req.body.book })
        .then(bookCollectionUpdate)
        .catch(err =>
          res.status(400).json({ errors: parseErrors(err.errors) })
        );
    }
  });

  const bookCollectionUpdate = book => {
    BookCollection.findOneAndUpdate(
      { _id: bookCollectionId },
      {
        $push: {
          list: { bookId: book._id, readPages: 0 }
        }
      },
      { new: true }
    ).then(result => {
      result ? res.json({ book }) : res.status(400).json({});
    });
  };

  const updateNumOfEntities = book => {
    Book.findOneAndUpdate(
      { _id: book._id },
      { numberOfEntities: book.numberOfEntities + 1 },
      { new: true }
    ).then(result => {
      result ? res.status(200).json({}) : res.status(400).json({});
    });
  }
});

router.post("/delete_book", (req, res) => {
  const { id } = req.body;
  const { bookCollectionId } = req.currentUser;

  Book.findById(id).then(function(book) {
    if (book.numberOfEntities > 1) {
      numOfEntitiesDec(book);
    } else {
      Book.findByIdAndRemove(id)
        .then(bookCollectionUpdate())
        .catch(err => {
          res.status(400).json({ errors: parseErrors(err.errors) });
        });
    }
  });

  const numOfEntitiesDec = () => {
    Book.findByIdAndUpdate(
      id,
      { $inc: { numberOfEntities: - 1 } },
      { new: true }
    ).then(result => {
      result ? bookCollectionUpdate() : res.status(400).json({});
    });
  };

  const bookCollectionUpdate = () => {
    BookCollection.findByIdAndUpdate(
      bookCollectionId,
      {
        $pull: {
          list: { bookId: new mongoose.Types.ObjectId(id) }
        }
      },
      { new: true }
    ).then(result => {
      result ? res.status(200).json({}) : res.status(400).json({});
    });
  };
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
              image_url: work.best_book[0].small_image_url[0]
            })
          )
        })
      )
    );
});

router.get("/search_by_page", (req, res) => {
  request
    .get(
      `https://www.goodreads.com/search/index.xml?key=FJ8QTTCeXMYySmerRew60g&q=${req.query.q}&page=${req.query.page}`
    )
    .then(result =>
      parseString(result, (err, goodreadsResult) =>
        res.json({
          books: goodreadsResult.GoodreadsResponse.search[0].results[0].work.map(
            work => ({
              goodreadsId: work.best_book[0].id[0]._,
              title: work.best_book[0].title[0],
              authors: work.best_book[0].author[0].name[0],
              image_url: work.best_book[0].small_image_url[0],
              rating: work.average_rating[0]
            })
          ),
          query_time_seconds:
            goodreadsResult.GoodreadsResponse.search[0][
              "query-time-seconds"
            ][0],
          total_results:
            goodreadsResult.GoodreadsResponse.search[0]["total-results"][0]
        })
      )
    );
});

router.get("/fetch_book_data", (req, res) => {
  const { goodreadsId } = req.query;
  request
    .get(
      `https://www.goodreads.com/book/show.xml?key=FJ8QTTCeXMYySmerRew60g&id=${goodreadsId}`
    )
    .then(result =>
      parseString(result, (err, goodreadsResult) => {
        const path = goodreadsResult.GoodreadsResponse.book[0];
        res.json({
          goodreadsId: path.id[0],
          image_url: path.image_url[0],
          title: path.title[0],
          description: path.description[0],
          authors: path.authors[0].author[0].name[0],
          average_rating: path.average_rating[0],
          pages: path.num_pages[0],
          publisher: path.publisher[0],
          publication_day: path.publication_day[0],
          publication_month: path.publication_month[0],
          publication_year: path.publication_year[0],
          format: path.format[0]
        });
      })
    );
});

export default router;
