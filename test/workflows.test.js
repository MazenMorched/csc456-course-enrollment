const { once } = require('node:events');
const { randomBytes, randomUUID } = require('node:crypto');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const bcrypt = require('bcrypt');
const mongoose = require('mongoose');
const { createApp } = require('../app');
const models = require('../models');

test('dashboard workflows using a MongoDB replica set', { timeout: 35000 }, async () => {
  assert.ok(process.env.TEST_MONGODB_URI, 'Set TEST_MONGODB_URI to a disposable replica set.');
  const dbName = 'course_test_' + randomUUID().replaceAll('-', '');
  await mongoose.connect(process.env.TEST_MONGODB_URI, { dbName, serverSelectionTimeoutMS: 8000 });
  let server;
  try {
    await Promise.all(Object.values(models).map(model => model.init()));
    const config = { secret: randomBytes(32).toString('hex'), production: false };
    server = createApp(config).listen(0, '127.0.0.1');
    await once(server, 'listening');
    const origin = 'http://127.0.0.1:' + server.address().port;

    function client(initialCookies = []) {
      const cookies = new Map(initialCookies);
      let csrf;
      async function request(path, status = 200, form) {
        const options = {
          redirect: 'manual',
          headers: { Cookie: [...cookies].map(([key, value]) => key + '=' + value).join('; ') }
        };
        if (form) {
          options.method = 'POST';
          options.body = new URLSearchParams({ _csrf: csrf ?? '', ...form });
        }
        const response = await fetch(origin + path, options);
        const body = await response.text();
        for (const cookie of response.headers.getSetCookie()) {
          const [pair] = cookie.split(';');
          const split = pair.indexOf('=');
          cookies.set(pair.slice(0, split), pair.slice(split + 1));
        }
        csrf = body.match(/name="_csrf" value="([a-f0-9]+)"/)?.[1] || csrf;
        assert.equal(response.status, status, path + ' ' + body.slice(0, 180));
        return { body, location: response.headers.get('location') };
      }
      return { request, cookies };
    }

    const password = 'test-password-for-smoke';
    const adminEmail = 'admin@example.test';
    await models.User.create({
      name: 'Test Admin', email: adminEmail, role: 'admin', passwordHash: await bcrypt.hash(password, 4)
    });

    const guest = client();
    assert.equal((await guest.request('/dashboard', 303)).location, '/login');
    await guest.request('/health');
    await guest.request('/register');
    await guest.request('/register', 403, { _csrf: 'invalid' });
    await guest.request('/register', 303, {
      name: 'Test Staff', email: 'staff@example.test', password, role: 'admin'
    });
    const staff = client();
    await staff.request('/login');
    await staff.request('/login', 401, { email: 'staff@example.test', password: 'incorrect-password' });
    await staff.request('/login', 303, { email: 'staff@example.test', password });
    assert.match((await staff.request('/dashboard')).body, /Staff/);
    await staff.request('/courses/new', 403);
    await staff.request('/courses', 403, { title: 'Blocked' });

    const admin = client();
    await admin.request('/login');
    await admin.request('/login', 303, { email: adminEmail, password });
    await admin.request('/dashboard');

    async function create(resource, form, updated, newValue) {
      await admin.request('/' + resource + '/new');
      const { location: path } = await admin.request('/' + resource, 303, form);
      assert.ok(path.startsWith('/' + resource + '/'));
      await admin.request('/' + resource);
      await admin.request(path);
      await admin.request(path + '/edit');
      await admin.request(path + '/edit', 303, { ...form, ...updated });
      assert.ok((await admin.request(path)).body.includes(newValue));
      return { path, id: path.split('/').at(-1) };
    }

    const instructorForm = { name: 'Instructor One', email: 'teacher@example.test', department: 'Computing' };
    const instructor = await create('instructors', instructorForm, { department: 'Engineering' }, 'Engineering');
    await admin.request('/instructors', 409, instructorForm);
    const student = await create('students', {
      name: 'Student One', email: 'student@example.test', studentNumber: 'S100'
    }, { name: 'Student Updated' }, 'Student Updated');
    const secondStudent = await create('students', {
      name: 'Student Two', email: 'student2@example.test', studentNumber: 'S200'
    }, { name: 'Second Student' }, 'Second Student');
    const courseForm = { title: 'Web Programming', code: 'WEB100', instructor: instructor.id };
    const course = await create('courses', courseForm, { title: 'Web Applications' }, 'Web Applications');
    const second = await create('courses', { ...courseForm, code: 'WEB200' }, { title: 'Web Systems' }, 'Web Systems');
    assert.match((await admin.request(instructor.path)).body, /Web Applications[\s\S]*Web Systems/);
    await admin.request('/courses', 422, { ...courseForm, instructor: student.id });

    const otherInstructor = await create('instructors', {
      ...instructorForm, email: 'other-teacher@example.test'
    }, { name: 'Second Instructor' }, 'Second Instructor');
    const teaching = '/teaching/' + otherInstructor.id;
    await staff.request(teaching);
    await staff.request(teaching, 403, { course: second.id });
    await admin.request(teaching);
    await admin.request(teaching, 303, { course: second.id });
    assert.equal(String((await models.Course.findById(second.id)).instructor), otherInstructor.id);

    await staff.request('/enrollments');
    const enrollment = '/enrollments/' + course.id;
    await staff.request(enrollment);
    await Promise.all([
      staff.request(enrollment, 303, { student: student.id }),
      staff.request(enrollment, 303, { student: student.id })
    ]);
    await staff.request(enrollment, 303, { student: secondStudent.id });
    await staff.request('/enrollments/' + second.id, 303, { student: student.id });
    assert.equal((await models.Course.findById(course.id)).students.length, 2);
    assert.match((await staff.request(student.path)).body, /Web Applications[\s\S]*Web Systems/);
    await admin.request(instructor.path + '/delete', 409, {});
    await admin.request(student.path + '/delete', 409, {});
    await staff.request(enrollment + '/students/' + student.id + '/remove', 303, {});
    assert.equal((await models.Course.findById(course.id)).students.length, 1);

    for (const record of [course, second, student, secondStudent, instructor, otherInstructor]) {
      await admin.request(record.path + '/delete');
      await admin.request(record.path + '/delete', 303, {});
      await admin.request(record.path, 404);
    }

    const oldSession = client(staff.cookies);
    await staff.request('/logout', 303, {});
    await staff.request('/dashboard', 303);
    await oldSession.request('/dashboard', 303);
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});
