import mongoose from "mongoose";

const schema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true
    },
    authors: {
      type: String,
      required: true
    },
    image_url: {
      type: String,
      required: true
    },
    goodreadsId: {
      type: String,
      required: true
    },
    pages: {
      type: Number,
      required: true
    },
    average_rating: {
      type: Number,
      required: true
    },
    description: {
      type: String,
      required: true
    },
    format: {
      type: String,
      required: true
    },
    publication_day: {
      type: Number,
      required: true
    },
    publication_month: {
      type: Number,
      required: true
    },
    publication_year: {
      type: Number,
      required: true
    },
    numberOfEntities: {
      type: Number,
      default: 1,
      required: true
    },
    likeCounter: {
      type: Number,
      default: 0,
      required: true
    }
  },
  { versionKey: false }
);

export default mongoose.model("Book", schema);
