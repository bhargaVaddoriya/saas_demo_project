const mongoose = require("mongoose");
const { ORGANIZATION, USER } = require('../constants/database.constant');

const slugify = (text) => {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
};

const organizationSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 120,
    },

    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },

    description: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: "",
    },

    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: USER,
      required: true,
      index: true,
    },

    isArchived: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

// Fast lookups by owner
organizationSchema.index({ ownerId: 1, createdAt: -1 });

// Static method to generate unique slug
organizationSchema.statics.generateUniqueSlug = async function (name, excludeId = null) {
  let baseSlug = slugify(name) || 'workspace';
  let candidate = baseSlug;
  let counter = 1;

  const query = (slug) => ({
    slug,
    ...(excludeId ? { _id: { $ne: excludeId } } : {}),
  });

  while (await this.exists(query(candidate))) {
    candidate = `${baseSlug}-${counter}`;
    counter++;
  }

  return candidate;
};

// Pre-validate hook to ensure unique slug is generated if missing
organizationSchema.pre('validate', async function () {
  if (!this.slug && this.name) {
    this.slug = await this.constructor.generateUniqueSlug(this.name, this._id);
  }
});

module.exports = mongoose.model(
  ORGANIZATION,
  organizationSchema
);