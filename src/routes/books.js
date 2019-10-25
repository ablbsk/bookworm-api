import express from "express";
import request from "request-promise";
import { parseString } from "xml2js";
import authenticate from "../middlewares/authenticate";
import Book from "../models/book";
import BookCollection from "../models/book-collection";

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

router.get("/check_read_book", async function(req, res) {
  const goodreadsId = req.query.id;
  const { bookCollectionId } = req.currentUser;

  try {
    const book = await Book.findOne({ goodreadsId });
    if(book) {
      const collection = await BookCollection.findById(bookCollectionId);
      const result = await checkInCollection(book._id, collection);
      await res.json({ result });
    } else {
      await res.json({ result: false });
    }
  }
  catch(e) {
    res.status(400).json({});
  }

  function checkInCollection(id, collection) {
    const { list } = collection;
    const i = list.findIndex(item => item.bookId.equals(id));
    return (i !== -1) ? {read: true, readPages: list[i].readPages} : false;
  }
});

router.post("/", async function(req, res) {
  const { goodreadsId } = req.body.book;
  const { bookCollectionId } = req.currentUser;

  try {
    const book = await Book.findOne({ goodreadsId });
    if (book) {
      await bookCollectionUpdate(book);
      await entitiesCountInc(book);
      await res.json({ book });
    } else {
      const newBook = await Book.create({ ...req.body.book });
      await bookCollectionUpdate(newBook);
      await entitiesCountInc(newBook);
      await res.json({ book: newBook });
    }
  }
  catch(e) {
    res.status(400).json({ errors: { global: "Error. Something went wrong." }});
  }

  /* --------------------------------------------- */

  function bookCollectionUpdate(book) {
    return BookCollection.findOneAndUpdate(
      { _id: bookCollectionId },
      {
        $push: {
          list: {
            bookId: book._id,
            pages: book.pages,
            readPages: 0
          }
        }
      },
      { new: true }
    )
  }

  function entitiesCountInc(book) {
    return Book.findOneAndUpdate(
      { _id: book._id },
      { $inc: { numberOfEntities: 1 } },
      { new: true }
    )
  }

});

router.post("/delete_book", async function(req, res) {
  const goodreadsId = req.body.id;
  const { bookCollectionId } = req.currentUser;

  try {
    const book = await Book.findOne({ goodreadsId });
    if (book.numberOfEntities > 1 || book.likeCounter >= 1) {
      await numOfEntitiesDec(book._id);
    } else {
      await Book.findOneAndRemove({ goodreadsId });
    }
    await bookCollectionUpdate(book._id);
    await res.json({ readStatus: false, id: book._id });
  }
  catch(e) {
    res.status(400).json({ errors: { global: "Error. Something went wrong." }});
  }

  /* --------------------------------------------- */

  function numOfEntitiesDec(id) {
    return Book.findByIdAndUpdate(
      id,
      { $inc: { numberOfEntities: -1 } },
      { new: true }
    )
  }

  function bookCollectionUpdate(id) {
    return BookCollection.findByIdAndUpdate(
      bookCollectionId,
      { $pull: { list: { bookId: id } } },
      { new: true }
    )
  }
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

router.get("/fetch_book_data", async function(req, res) {
  const { goodreadsId } = req.query;
  try {
    const resultRequest = await getRequest(goodreadsId);
    const book = await fetchBookData(resultRequest);
    await res.json({ book });
  }
  catch(e) {
    res.status(400).json("Server Error");
  }
});

/* --------------------------------------------------------- */

router.get("/check_like", async function(req, res) {
  const goodreadsId = req.query.id;
  const { bookCollectionId } = req.currentUser;

  try {
    const book = await Book.findOne({ goodreadsId });
    if (book) {
      const collection = await BookCollection.findById(bookCollectionId);
      const result = await checkInCollection(book._id, collection);
      await res.json({ result });
    } else {
      await res.json({ result: false });
    }
  }
  catch(e) {
    await res.json({ result: false });
  }

  /* --------------------------------------------- */

  async function checkInCollection(id, collection) {
    const { likeBookList } = collection;
    return !likeBookList.indexOf(id);
  }
});

router.post("/add_like", (req, res) => {
  const goodreadsId = req.body.id;
  const { bookCollectionId } = req.currentUser;

  Book.findOne({ goodreadsId })
    .then(book => {
    if (book) {
      addBookId(book);
    } else {
      getRequest(goodreadsId)
        .then(result => fetchBookData(result))
        .then(createBook);
    }

    function addBookId(entity) {
      const id = entity._id;
      return BookCollection.findByIdAndUpdate(bookCollectionId,
        { $push: {likeBookList: id} },
        { new: true }
      ).then(result => {
        result ? likeCountInc(1, id) : res.status(400).json("Server Error");
      });
    }

    function createBook(data) {
      Book.create({ ...data })
        .then(book => addBookId(book))
        .catch(() => res.status(400).json("Server Error"));
    }

    function likeCountInc(i, id) {
      Book.findByIdAndUpdate(id,
        {$inc: {likeCounter: i}},
        {new: true}
      ).then(book => {
        book ? res.json({ like: true }) : res.status(400).json("Server Error");
      });
    }
  });
});

router.post("/delete_like", (req, res) => {
  const goodreadsId = req.body.id;
  const { bookCollectionId } = req.currentUser;

  Book.findOne({ goodreadsId })
    .then(book => removeBookId(book));

  function removeBookId(book) {
    const id = book._id;
    BookCollection.findByIdAndUpdate(bookCollectionId,
      {$pull: {likeBookList: id}},
      {new: true}
    ).then(() => book.likeCounter > 1 ? likeCountDec(-1, id) : removeBook(id));
  }

  function likeCountDec(i, id) {
    Book.findByIdAndUpdate(id,
      { $inc: { likeCounter: i } },
      { new: true }
    ).then(book => {
      book ? res.json({ like: false }) : res.status(400).json("Server Error");
    });
  }

  function removeBook(id) {
    Book.findByIdAndRemove(id)
      .then(res.json({ like: false }))
      .catch(() => res.status(400).json("Server Error"));
  }
});

router.get("/get_top", async function(req, res) {
  const num = 2;
  const topLikeBooks = await Book.find()
    .sort({ likeCounter: -1 })
    .limit(num);

  const topReadBooks = await Book.find()
    .sort({ numberOfEntities: -1 })
    .limit(num);

  await res.json({ books: { topLikeBooks, topReadBooks } });
});

/* --------------------------------------------------------- */

router.post("/save_progress", async function(req, res) {
  const readPages = req.body.num;
  const goodreadsId = req.body.id;
  const { bookCollectionId } = req.currentUser;

  try {
    const book = await Book.findOne({ goodreadsId });
    await bookCollectionUpdate(book._id);
    await res.json({ readPages });
  }
  catch(e) {
    res.status(400).json({ errors: { global: "Error. Something went wrong." }});
  }

  function bookCollectionUpdate(id) {
    return BookCollection.update(
      { _id: bookCollectionId, "list.bookId": id },
      { $set: { "list.$.readPages": readPages } },
      { new: true }
    )
  }
});

/* ========================================================= */

function getRequest(goodreadsId) {
  return request.get(`https://www.goodreads.com/book/show.xml?key=FJ8QTTCeXMYySmerRew60g&id=${goodreadsId}`);
}

function fetchBookData(result) {
  return new Promise ((resolve, reject) => {
    parseString(result, (err, goodreadsResult) => {
      const path = goodreadsResult.GoodreadsResponse.book[0];
      const book = {
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
      };
      err ? reject(err) : resolve(book);
    });
  });
}

export default router;
