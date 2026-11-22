const mongoose = require('mongoose');
const { Course, Instructor, Student } = require('../models');

const field = (key, label, type = 'text', maxLength = 100) => ({ key, label, type, maxLength });
const resources = {
  instructors: {
    model: Instructor, singular: 'instructor', plural: 'Instructors', label: 'name',
    fields: [field('name', 'Full name'), field('email', 'Email', 'email', 254), field('department', 'Department')],
    reference: 'instructor'
  },
  students: {
    model: Student, singular: 'student', plural: 'Students', label: 'name',
    fields: [field('name', 'Full name'), field('email', 'Email', 'email', 254), field('studentNumber', 'Student number')],
    reference: 'students'
  },
  courses: {
    model: Course, singular: 'course', plural: 'Courses', label: 'title',
    fields: [field('title', 'Course title'), field('code', 'Course code'),
      field('instructor', 'Instructor', 'select'), field('description', 'Description', 'textarea', 500)]
  }
};

class FormError extends Error {
  constructor(message, status = 422) {
    super(message);
    this.status = status;
  }
}

function formError(error) {
  if (error instanceof FormError) return error;
  if (error.code === 11000) return new FormError('A record already uses that email, code, or number.', 409);
  if (error.name === 'ValidationError') return new FormError(Object.values(error.errors).map(item => item.message).join(' '));
  throw error;
}

function notFound(res) {
  return res.status(404).render('error', {
    title: 'Record unavailable', message: 'The requested record could not be found.',
    backUrl: '/dashboard', backLabel: 'Return to dashboard'
  });
}

// Write to the referenced record so linking and deleting it cannot both commit.
async function lockReference(model, id, session) {
  if (!mongoose.isObjectIdOrHexString(id)) return false;
  const result = await model.updateOne({ _id: id }, { $inc: { __v: 1 } }, { session });
  return result.matchedCount === 1;
}

function recordsController(key) {
  const resource = resources[key];
  const { model, singular, plural, label, fields, reference } = resource;
  const base = '/' + key;

  async function renderForm(res, mode, record, message = '', status = 200) {
    const instructors = model === Course ? await Instructor.find().sort('name').lean() : [];
    return res.status(status).render('records/form', {
      title: (mode === 'edit' ? 'Edit ' : 'New ') + singular, mode, record, resource, base, instructors, message
    });
  }

  async function save(req, res, mode) {
    const id = req.params.id;
    const values = Object.fromEntries(fields.map(({ key: name }) => [
      name, typeof req.body[name] === 'string' ? req.body[name].trim() : ''
    ]));
    const record = { ...values, _id: id };
    const write = async session => {
      if (model === Course && !await lockReference(Instructor, values.instructor, session)) {
        throw new FormError('Select an existing instructor.');
      }
      if (mode === 'create') return new model(values).save({ session });
      return model.findByIdAndUpdate(id, { $set: values }, { new: true, runValidators: true, session });
    };
    try {
      const saved = model === Course ? await mongoose.connection.transaction(write) : await write(null);
      if (!saved) return notFound(res);
      return res.redirect(303, base + '/' + saved.id);
    } catch (error) {
      const issue = formError(error);
      return renderForm(res, mode, record, issue.message, issue.status);
    }
  }

  function confirm(res, record, message = '', status = 200) {
    return res.status(status).render('records/delete', {
      title: 'Delete ' + singular, record, resource, base, message
    });
  }

  return {
    async list(req, res) {
      const query = model.find().sort(label);
      if (model === Course) query.populate('instructor', 'name');
      const records = await query.lean();
      return res.render('records/list', { title: plural, resource, records, base });
    },
    async details(req, res) {
      const query = model.findById(req.params.id);
      if (model === Course) query.populate('instructor', 'name').populate('students', 'name studentNumber');
      const record = await query.lean();
      if (!record) return notFound(res);
      const relatedCourses = reference ? await Course.find({ [reference]: record._id }).sort('title').lean() : [];
      return res.render('records/details', {
        title: record[label], resource, record, base, relatedCourses
      });
    },
    createForm: (req, res) => renderForm(res, 'create', {}),
    create: (req, res) => save(req, res, 'create'),
    async editForm(req, res) {
      const record = await model.findById(req.params.id).lean();
      return record ? renderForm(res, 'edit', record) : notFound(res);
    },
    update: (req, res) => save(req, res, 'edit'),
    async deleteForm(req, res) {
      const record = await model.findById(req.params.id).lean();
      return record ? confirm(res, record) : notFound(res);
    },
    async remove(req, res) {
      const { id } = req.params;
      try {
        const deleted = reference ? await mongoose.connection.transaction(async session => {
          if (!await lockReference(model, id, session)) return null;
          if (await Course.exists({ [reference]: id }).session(session)) {
            const message = singular === 'instructor'
              ? 'Reassign or delete this instructor’s courses before deleting the instructor.'
              : 'Remove this student’s course enrollments before deleting the student.';
            throw new FormError(message, 409);
          }
          return model.findByIdAndDelete(id, { session });
        }) : await model.findByIdAndDelete(id);
        return deleted ? res.redirect(303, base) : notFound(res);
      } catch (error) {
        const issue = formError(error);
        const record = await model.findById(id).lean();
        return record ? confirm(res, record, issue.message, issue.status) : notFound(res);
      }
    }
  };
}

module.exports = { resources, recordsController, notFound, lockReference, FormError };
