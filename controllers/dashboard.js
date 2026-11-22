const { Course, Instructor, Student } = require('../models');

async function showDashboard(req, res) {
  const [instructors, courses, students, enrollmentTotals, recentCourses] = await Promise.all([
    Instructor.countDocuments(),
    Course.countDocuments(),
    Student.countDocuments(),
    Course.aggregate([
      { $group: { _id: null, total: { $sum: { $size: { $ifNull: ['$students', []] } } } } }
    ]),
    Course.find().sort({ createdAt: -1, _id: -1 }).limit(5)
      .select('title code instructor students').populate('instructor', 'name').lean()
  ]);
  const stats = { instructors, courses, students, enrollments: enrollmentTotals[0]?.total ?? 0 };
  return res.render('dashboard', { title: 'Dashboard', stats, recentCourses });
}

module.exports = { showDashboard };
