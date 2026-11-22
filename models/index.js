const { Schema, model } = require('mongoose');

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const name = { type: String, required: true, trim: true, maxlength: 100 };
const email = {
  type: String, required: true, trim: true, lowercase: true, maxlength: 254,
  match: [emailPattern, 'Enter a valid email address.'], unique: true
};
const options = { timestamps: true };

const Instructor = model('Instructor', new Schema({ name, email, department: name }, options));
const Student = model('Student', new Schema({
  name, email, studentNumber: { ...name, uppercase: true, unique: true }
}, options));
const Course = model('Course', new Schema({
  title: name,
  code: { ...name, uppercase: true, unique: true },
  description: { type: String, trim: true, maxlength: 500 },
  instructor: { type: Schema.Types.ObjectId, ref: 'Instructor', required: true, index: true },
  students: [{ type: Schema.Types.ObjectId, ref: 'Student', index: true }]
}, options));

const User = model('User', new Schema({
  name, email,
  passwordHash: { type: String, required: true, select: false },
  role: { type: String, enum: ['admin', 'staff'], default: 'staff', required: true }
}, options));
const LoginSession = model('LoginSession', new Schema({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  expiresAt: { type: Date, required: true, expires: 0 }
}));

module.exports = { Instructor, Student, Course, User, LoginSession };
