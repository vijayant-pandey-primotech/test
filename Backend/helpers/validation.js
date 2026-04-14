import Joi from "joi";

const platformSchema = Joi.object({
  name: Joi.string().required(),
  description: Joi.string().required(),
});

const validatePlatform = (req, res, next) => {
  const { error } = platformSchema.validate(req.body);
  if (error) {
    return res.status(400).json({ message: error.details[0].message });
  }
  next();
};

const storySchema = Joi.object({
  storyName: Joi.string().required(),
  subcategoryName: Joi.string().optional(),
  isDefault: Joi.boolean().required(),
  description: Joi.string().optional(),
});

const validateStory = (req, res, next) => {
  const { error } = storySchema.validate(req.body);
  if (error) {
    return res.status(400).json({ message: error.details[0].message });
  }
  next();
};

const chapterSchema = Joi.object({
  chapterName: Joi.string().required(),
  storyId: Joi.number().required(),
  description: Joi.string().allow('').optional(),
  firstMessage: Joi.string().allow('').optional(),
  isDynamic: Joi.boolean().optional(),
  icon: Joi.string().allow(null, '').optional(), // Allow icon to be copied
});

const validateChapter = (req, res, next) => {
  const { error } = chapterSchema.validate(req.body);
  if (error) {
    return res.status(400).json({ message: error.details[0].message });
  }
  next();
};

const storiesByPlatformsSchema = Joi.object({
  platforms: Joi.array().items(Joi.string()).min(1).required(),
  includeInactive: Joi.boolean().optional().default(false),
});

const validateStoriesByPlatforms = (req, res, next) => {
  const { error } = storiesByPlatformsSchema.validate(req.body);
  if (error) {
    return res.status(400).json({ message: error.details[0].message });
  }
  next();
};

export {
  validatePlatform,
  validateStory,
  validateChapter,
  validateStoriesByPlatforms,
};
