const mongoose = require('mongoose');
const { Course, Instructor } = require('../models');
const { notFound, lockReference } = require('./records');

async function showAssignments(req, res, message = '', status = 200) {
  const instructor = await Instructor.findById(req.params.id).lean();
  if (!instructor) return notFound(res);
  const courses = await Course.find().select('title code instructor').sort('title').lean();
  const assigned = courses.filter(course => course.instructor.equals(instructor._id));
  const available = courses.filter(course => !course.instructor.equals(instructor._id));
  return res.status(status).render('records/teaching', {
    title: 'Teaching assignments', instructor, assigned, available, message
  });
}

async function assign(req, res) {
  const { course } = req.body;
  const { id } = req.params;
  if (!mongoose.isObjectIdOrHexString(course)) {
    return showAssignments(req, res, 'Select an existing course.', 422);
  }
  const outcome = await mongoose.connection.transaction(async session => {
    if (!await lockReference(Instructor, id, session)) return null;
    return Course.updateOne({ _id: course }, { $set: { instructor: id } }, { session, runValidators: true });
  });
  if (!outcome) return notFound(res);
  if (!outcome.matchedCount) return showAssignments(req, res, 'Select an existing course.', 422);
  return res.redirect(303, '/teaching/' + id);
}

module.exports = { showAssignments, assign };
