import express from "express";
import request from "request-promise";
import { parseString } from "xml2js";
import authenticate from "../middlewares/authenticate";
import Book from "../models/book";
import BookCollection from "../models/book-collection";

const router = express.Router();

router.get("/", authenticate, async function(req, res) {
  const { bookCollectionId } = req.currentUser;
  try {
    const collection = await BookCollection.findById(bookCollectionId);
    const bookList = collection.list;
    const ids = bookList.map(item => item.bookId);
    const books = await Book.find({ _id: { $in: ids } }, [
      "title",
      "image_url",
      "authors",
      "average_rating",
      "goodreadsId",
      "pages"
    ]);
    const data = await addLikeStatus(collection, books, bookList);
    await res.json({ books: data });
  } catch (e) {
    res.status(500).json("Server error");
  }

  function addLikeStatus(collection, books, bookList) {
    const likeBookList = collection.likeBookList;
    return books.map(book => {
      book = book.toJSON();
      if (likeBookList.length === 0) {
        book.likeStatus = false;
      } else {
        for (let i = 0; i < likeBookList.length; i++) {
          book._id.equals(likeBookList[i])
            ? (book.likeStatus = true)
            : (book.likeStatus = false);
        }
      }

      if (bookList.length === 0) {
        book.readPages = 0;
      } else {
        for (let i = 0; i < bookList.length; i++) {
          if (book._id.equals(bookList[i].bookId)) {
            book.readPages = bookList[i].readPages;
          }
        }
      }
      return book;
    });
  }
});

router.post("/", authenticate, async function(req, res) {
  const { goodreadsId } = req.body.book;
  const { bookCollectionId } = req.currentUser;

  try {
    const book = await Book.findOne({ goodreadsId });
    let entity = book ? book : await Book.create({ ...req.body.book });
    await bookCollectionUpdate(entity);
    await updateEntitiesCount(1, entity._id);
    const collection = await BookCollection.findById(bookCollectionId);
    const likeStatus = await checkLikeInCollection(entity._id, collection);
    await res.json({ book: { ...entity._doc, readStatus: true, likeStatus } });
  } catch (e) {
    res
      .status(500)
      .json({ errors: { global: "Error. Something went wrong." } });
  }

  /* --------------------------------------------- */

  function bookCollectionUpdate(book) {
    return BookCollection.findOneAndUpdate(
      { _id: bookCollectionId },
      {
        $push: {
          list: {
            bookId: book._id,
            readPages: 0
          }
        }
      },
      { new: true }
    );
  }

});

router.post("/delete_book", authenticate, async function(req, res) {
  const goodreadsId = req.body.id;
  const { bookCollectionId } = req.currentUser;

  try {
    const book = await Book.findOne({ goodreadsId });
    if (book.numberOfEntities > 1 || book.likeCounter >= 1) {
      await updateEntitiesCount(-1, book._id);
    } else {
      await Book.findOneAndRemove({ goodreadsId });
    }
    await bookCollectionUpdate(book._id);
    const collection = await BookCollection.findById(bookCollectionId);
    const likeStatus = await checkLikeInCollection(book._id, collection);
    await res.json({ book: { ...book._doc, likeStatus } });
  } catch (e) {
    res
      .status(500)
      .json({ errors: { global: "Error. Something went wrong." } });
  }

  /* --------------------------------------------- */

  function bookCollectionUpdate(id) {
    return BookCollection.findByIdAndUpdate(
      bookCollectionId,
      { $pull: { list: { bookId: id } } },
      { new: true }
    );
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

router.get("/fetch_book_data", authenticate, async function(req, res) {
  const { goodreadsId } = req.query;

  try {
    const resultRequest = await getRequest(goodreadsId);
    const data = await fetchBookData(resultRequest);
    const book = await Book.findOne({ goodreadsId });

    if (!req.currentUser) {
      await res.json({ book });
    }

    const { bookCollectionId } = req.currentUser;

    if (book) {
      const collection = await BookCollection.findById(bookCollectionId);
      const likeStatus = await checkLikeInCollection(book._id, collection);
      const readStatus = await checkReadInCollection(book._id, collection);
      await res.json({
        book: {
          ...data,
          likeStatus,
          readStatus: readStatus.read,
          readPages: readStatus.readPages
        }
      });
    } else {
      await res.json({
        book: {
          ...data,
          likeStatus: false,
          readStatus: false,
          readPages: 0
        }
      });
    }
  } catch (e) {
    res.status(500).json("Server Error");
  }
});

router.post("/add_like", authenticate, async function(req, res) {
  const goodreadsId = req.body.id;
  const { bookCollectionId } = req.currentUser;

  try {
    const book = await Book.findOne({ goodreadsId });
    let entity = null;
    if (!book) {
      const resultRequest = await getRequest(goodreadsId);
      const data = await fetchBookData(resultRequest);
      entity = await Book.create({ ...data });
    } else {
      entity = book;
    }
    await addBookId(entity._id);
    await updateLikeCount(1, entity._id);
    const collection = await BookCollection.findById(bookCollectionId);
    const readStatus = await checkReadInCollection(entity._id, collection);
    await res.json({
      book: {
        ...entity._doc,
        likeStatus: true,
        readStatus: readStatus.read,
        readPages: readStatus.readPages
      }
    });
  } catch (e) {
    res
      .status(500)
      .json({ errors: { global: "Error. Something went wrong." } });
  }

  /* --------------------------------------------- */

  function addBookId(id) {
    return BookCollection.findByIdAndUpdate(
      bookCollectionId,
      { $push: { likeBookList: id } },
      { new: true }
    );
  }
});

router.post("/delete_like", authenticate, async function(req, res) {
  const goodreadsId = req.body.id;
  const { bookCollectionId } = req.currentUser;

  try {
    const book = await Book.findOne({ goodreadsId });
    const id = book._id;
    await removeBookId(id);

    book.likeCounter > 1 || book.numberOfEntities >= 1
      ? await updateLikeCount(-1, id)
      : await Book.findByIdAndRemove(id);
    const collection = await BookCollection.findById(bookCollectionId);
    const readStatus = await checkReadInCollection(book._id, collection);
    await res.json({
      book: {
        ...book._doc,
        likeStatus: false,
        readStatus: readStatus.read,
        readPages: readStatus.readPages
      }
    });
  } catch (e) {
    res
      .status(500)
      .json({ errors: { global: "Error. Something went wrong." } });
  }

  function removeBookId(id) {
    return BookCollection.findByIdAndUpdate(
      bookCollectionId,
      { $pull: { likeBookList: id } },
      { new: true }
    );
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

router.post("/save_progress", authenticate, async function(req, res) {
  const readPages = req.body.num;
  const goodreadsId = req.body.id;
  const { bookCollectionId } = req.currentUser;

  try {
    const book = await Book.findOne({ goodreadsId });
    await bookCollectionUpdate(book._id);
    await res.json({ progress: { goodreadsId: book.goodreadsId, readPages } });
  } catch (e) {
    res
      .status(500)
      .json({ errors: { global: "Error. Something went wrong." } });
  }

  function bookCollectionUpdate(id) {
    return BookCollection.update(
      { _id: bookCollectionId, "list.bookId": id },
      { $set: { "list.$.readPages": readPages } },
      { new: true }
    );
  }
});

/* ========================================================= */

function getRequest(goodreadsId) {
  return request.get(`https://www.goodreads.com/book/show.xml?key=FJ8QTTCeXMYySmerRew60g&id=${goodreadsId}`);
}

function fetchBookData(result) {
  return new Promise((resolve, reject) => {
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

function checkReadInCollection(id, collection) {
  const { list } = collection;
  const i = list.findIndex(item => item.bookId.equals(id));
  return i !== -1 ? { read: true, readPages: list[i].readPages } : false;
}

function checkLikeInCollection(id, collection) {
  const { likeBookList } = collection;
  return likeBookList.indexOf(id) !== -1;
}

function updateLikeCount(i, id) {
  return Book.findByIdAndUpdate(id, {$inc: {likeCounter: i}}, {new: true});
}

function updateEntitiesCount(i, id) {
  return Book.findByIdAndUpdate(id, { $inc: { numberOfEntities: i } }, { new: true });
}

export default router;
