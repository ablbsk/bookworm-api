import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  title: {
    type: String, required: true
  },
  authors: {
    type: String, required: true
  },
  image_url: {
    type: String, required: true
  },
  goodreadsId: {
    type: String
  },
  pages: {
    type: Number, required: true
  },
  numberOfEntities: {
    type: Number, default: 1
  }
});

export default mongoose.model('Book', schema);
