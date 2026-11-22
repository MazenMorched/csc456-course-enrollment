const { Course, Instructor, Student } = require('../models');

async function showDashboard(req, res) {
  const [instructors, courses, students, enrollmentTotals] = await Promise.all([
    Instructor.countDocuments(),
    Course.countDocuments(),
    Student.countDocuments(),
    Course.aggregate([
      { $group: { _id: null, total: { $sum: { $size: { $ifNull: ['$students', []] } } } } }
    ])
  ]);
  const stats = { instructors, courses, students, enrollments: enrollmentTotals[0]?.total ?? 0 };
  return res.render('dashboard', { title: 'Dashboard', stats });
}

module.exports = { showDashboard };
