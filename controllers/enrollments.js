const mongoose = require('mongoose');
const { Course, Student } = require('../models');
const { notFound, lockReference, FormError } = require('./records');

async function list(req, res) {
  const courses = await Course.find().sort('title').populate('instructor', 'name').lean();
  return res.render('enrollments/list', { title: 'Enrollments', courses });
}

async function showCourse(req, res, message = '', status = 200) {
  const course = await Course.findById(req.params.id)
    .populate('instructor', 'name').populate('students', 'name studentNumber').lean();
  if (!course) return notFound(res);
  const enrolledIds = course.students.map(student => student._id);
  const available = await Student.find({ _id: { $nin: enrolledIds } }).sort('name').lean();
  return res.status(status).render('enrollments/course', {
    title: course.title + ' enrollments', course, available, message
  });
}

async function add(req, res) {
  try {
    const updated = await mongoose.connection.transaction(async session => {
      const id = req.body.student;
      if (!await lockReference(Student, id, session)) throw new FormError('Select an existing student.');
      return Course.updateOne({ _id: req.params.id }, { $addToSet: { students: id } }, { session });
    });
    if (!updated.matchedCount) return notFound(res);
    return res.redirect(303, '/enrollments/' + req.params.id);
  } catch (error) {
    if (error instanceof FormError) return showCourse(req, res, error.message, error.status);
    throw error;
  }
}

async function remove(req, res) {
  const { id, studentId } = req.params;
  const result = await Course.updateOne({ _id: id }, { $pull: { students: studentId } });
  return result.matchedCount ? res.redirect(303, '/enrollments/' + id) : notFound(res);
}

module.exports = { list, showCourse, add, remove };
