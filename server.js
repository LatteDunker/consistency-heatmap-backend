require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const bodyParser = require('body-parser');
const { body, validationResult } = require('express-validator');
const cors = require('cors');


const app = express();
const PORT = process.env.PORT || 3000;
const databaseURI = process.env.DATABASE_URI
const JWT_SECRET = process.env.JWT_SECRET; 
const JWT_REFRESH_TOKEN_SECRET = process.env.JWT_REFRESH_TOKEN_SECRET; // promise ill use a secure key in production xddd
const refreshTokens = []; // In-memory storage for refresh tokens (will use a database in production)

// Connect to MongoDB
mongoose.connect(databaseURI, { 
  useNewUrlParser: true, 
  useUnifiedTopology: true 
})
.then(() => {
  console.log('Connected to MongoDB');
  // List collections after successful connection
})
.catch(err => console.error('Error connecting to MongoDB:', err));

// Middleware
app.use(express.json());
app.use(express.static('public'))

// Enable CORS for specific origin (React frontend)
app.use(cors({
  origin: 'http://localhost:3001'  // Replace this with the URL of your React app
}));

// Event Schema
const eventSchema = new mongoose.Schema({
    title: { type: String, required: true },
    date: { type: Date, required: true },
    description: { type: String }
  });
  
  // Calendar Schema
  const calendarSchema = new mongoose.Schema({
    name: { type: String, required: true },
    events: [eventSchema] // Array of eventSchema
  });
  
// User Schema
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  calendars: [calendarSchema], // Array of calendars
});

const User = mongoose.model('User', userSchema);

// Signup route
app.post('/api/signup', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    
    const user = new User({
      username,
      email,
      password: hashedPassword,
      calendars: []
    });

    await user.save();
    res.status(201).json({ message: 'User created successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Login route
app.post('/api/login', async (req, res) => {
  
  const { username, password } = req.body;

    try {
      const user = await User.findOne({ username });
      if (!user) {
        return res.status(400).json({ error: 'Invalid credentials' });
      }

      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        return res.status(400).json({ error: 'Invalid credentials' });
      }
      const token = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: '1h' });
      console.log(user._id)
      res.json({ token });
    
    } catch (err) {
      res.status(500).json({ error: 'Server error' });
    }
  }
);




// Middleware to authenticate using JWT
const authenticateToken = (req, res, next) => {
    console.log('Headers:', req.headers); // Log all headers
    const authHeader = req.headers['authorization'];
    console.log('Auth Header:', authHeader); // Log the authorization header

    if (!authHeader) {
        return res.status(401).json({ error: 'No authorization header' });
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
        return res.status(401).json({ error: 'No token provided' });
    }

    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) {
            console.error('JWT Verification Error:', err);
            return res.status(403).json({ error: 'Invalid token', details: err.message });
        }
        req.userId = decoded.userId;
        next();
    });
  };
  
// createCalendar route
app.post('/api/createCalendar', authenticateToken, async (req, res) => {
    try {
        const userId = req.userId;
        const { calendarName } = req.body;
  
        if (!calendarName) {
            return res.status(400).json({ error: 'Calendar name is required' });
        }
        // Find the user by ID and update their calendars
        const user = await User.findById(userId);
        if (!user) {
           return res.status(404).json({ error: 'User not found' });
        }
        user.calendars.push({ name: calendarName, events: [] });
        await user.save();
        res.status(201).json({ message: 'Calendar created successfully', calendar: user.calendars });
      } catch (err) {
            console.error('Error in createCalendar:', err);
            res.status(500).json({ error: 'Server error', details: err.message });
      }
    }
  );

// deleteCalendar route
app.post('/api/deleteCalendar', authenticateToken, async (req, res) => {
    try {
        const userId = req.userId;
        const { deleteCalendarName } = req.body;
  
        if (!deleteCalendarName) {
            return res.status(400).json({ error: 'Calendar name is required' });
        }
        // Find the user by ID and update their calendars
        const user = await User.findById(userId);
        if (!user) {
           return res.status(404).json({ error: 'User not found' });
        }
        // Find the index of the calendar with the specified name
        const calendarIndex = user.calendars.findIndex(calendar => calendar.name === deleteCalendarName);

               // Logging for debugging
               console.log('User calendars:', deleteCalendarName);
               console.log('Delete calendar name:', user.calendars[calendarIndex].name);

        if (calendarIndex === -1) {
            return res.status(404).json({ error: 'Calendar not found' });
        }
        // Remove the calendar from the array
        user.calendars.splice(calendarIndex, 1);
        await user.save();
        res.status(200).json({ message: 'Calendar deleted successfully' });
      } catch (err) {
            console.error('Error in createCalendar:', err);
            res.status(500).json({ error: 'Server error', details: err.message });
      }
    }
  );

// Edit Calendar Route
app.post('/api/editCalendar', authenticateToken, async (req, res) => {
  try {
      const userId = req.userId;
      const { calendarName, newCalendarName } = req.body;
      
      if (!calendarName || !newCalendarName) {
          return res.status(400).json({ error: 'Missing required field.' });
      }

      // Find the user by ID and update their calendars
      const user = await User.findById(userId);
      if (!user) {
          return res.status(404).json({ error: 'User not found' });
      }

      // Find the calendar by name
      const calendar = user.calendars.find(calendar => calendar.name === calendarName);
      if (!calendar) {
          return res.status(404).json({ error: 'Calendar not found' });
      }

      // Update event fields if they are provided
      if (newCalendarName) calendar.name = newCalendarName;

      // Save the updated user document
      await user.save();
      res.status(200).json({ message: 'Calendar updated successfully' });
    } 
    catch (err) {
      console.error('Error in editCalendar:', err);
      res.status(500).json({ error: 'Server error', details: err.message });
  }
});

// getCalendars route

  app.get('/api/getCalendars', authenticateToken, async (req, res) => {
    try {
        const userId = req.userId;
        // Find the user by ID and update their calendars
        const user = await User.findById(userId);
        if (!user) {
           return res.status(404).json({ error: 'User not found' });
        }
        // Respond with the user's calendars
        res.status(200).json({ calendars: user.calendars });
    } catch (err) {
        console.error('Error in getting calendars:', err);
        res.status(500).json({ error: 'Server error', details: err.message });
    }
  });

  // add event route

app.post('/api/createEvent', authenticateToken, async (req, res) => {
    try {
        const userId = req.userId;
        const { calendarName, event } = req.body;
        
        if (!calendarName || !event) {
            return res.status(400).json({ error: 'Missing required field.' });
        }

        // Find the user by ID and update their calendars
        const user = await User.findById(userId);
        if (!user) {
           return res.status(404).json({ error: 'User not found' });
        }

        // Find the index of the calendar with the specified name
        const calendarIndex = user.calendars.findIndex(calendar => calendar.name === calendarName);
        if (calendarIndex === -1) {
            return res.status(404).json({ error: 'Calendar not found' });
        }

        // Add the new event to the calendar's events array
        user.calendars[calendarIndex].events.push(event);
        await user.save();
        res.status(200).json({ message: 'Event inserted successfully' });
    } catch (err) {
        console.error('Error in addEvent:', err);
        res.status(500).json({ error: 'Server error', details: err.message });
    }
  }
);

app.post('/api/deleteEvent', authenticateToken, async (req, res) => {
  try {
      const userId = req.userId;
      const { calendarName, eventId } = req.body;
      
      if (!calendarName || !eventId) {
          return res.status(400).json({ error: 'Missing required field.' });
      }

      // Find the user by ID and update their calendars
      const user = await User.findById(userId);
      if (!user) {
         return res.status(404).json({ error: 'User not found' });
      }

      // Find the calendar by name
      const calendar = user.calendars.find(calendar => calendar.name === calendarName);
      if (!calendar) {
          return res.status(404).json({ error: 'Calendar not found' });
      }

      // Find the index of the event with the specified ID
      const eventIndex = calendar.events.findIndex(event => event._id.toString() === eventId);
      if (eventIndex === -1) {
          return res.status(404).json({ error: 'Event not found' });
      }
      // Remove the event from the array
      calendar.events.splice(eventIndex, 1);
      await user.save();
      res.status(200).json({ message: 'Event deleted successfully' });
    } 
    catch (err) {
      console.error('Error in addEvent:', err);
      res.status(500).json({ error: 'Server error', details: err.message });
  }
});

app.post('/api/editEvent', authenticateToken, async (req, res) => {
  try {
      const userId = req.userId;
      const { calendarName, eventId, eventTitle, eventDescription } = req.body;
      
      if (!calendarName || !eventId) {
          return res.status(400).json({ error: 'Missing required field.' });
      }

      if (!eventTitle && !eventDescription) {
        return res.status(400).json({ error: 'Atleast one field is required to make an edit.' });
      }

      // Find the user by ID and update their calendars
      const user = await User.findById(userId);
      if (!user) {
         return res.status(404).json({ error: 'User not found' });
      }

      // Find the calendar by name
      const calendar = user.calendars.find(calendar => calendar.name === calendarName);
      if (!calendar) {
          return res.status(404).json({ error: 'Calendar not found' });
      }

      // Find the event with the specified ID
      const event = calendar.events.id(eventId);
      if (!event) {
        return res.status(404).json({ error: 'Event not found' });
      }
     // Update event fields if they are provided
     if (eventTitle) event.title = eventTitle;
     if (eventDescription) event.description = eventDescription;

     // Save the updated user document
     await user.save();
     res.status(200).json({ message: 'Event updated successfully' });
    } 
    catch (err) {
      console.error('Error in addEvent:', err);
      res.status(500).json({ error: 'Server error', details: err.message });
  }
});

app.post('/api/editProfilePicture')




app.listen(PORT, () => console.log(`Server running on port ${PORT}`));