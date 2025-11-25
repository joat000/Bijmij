# 🌸 BOOK&BLOOM - Beauty Booking Platform

## Quick Start Guide

### Prerequisites
- Python 3.7+
- Modern web browser (Chrome, Firefox, Safari, Edge)

### Installation & Running

1. **Install Dependencies**
```bash
pip install -r requirements.txt
```

2. **Initialize Database** (if needed)
```bash
python backend/database.py
```

3. **Start the Server**
```bash
python backend/app.py
```

4. **Open in Browser**
```
http://localhost:5000
```

## 🎯 Features Overview

### For Users 👤
- **Discover** beauty businesses near you
- **Search** by name or location
- **Filter** by business type (Salon, Spa, Nails, Makeup, Skin Care)
- **Get Directions** with turn-by-turn routing
- **Book Appointments** with interactive calendar
- **Save Favorites** for quick access
- **Receive Notifications** about new businesses nearby

### For Businesses 💼
- **Dashboard** with real-time statistics
- **Location Display** on interactive map
- **Booking Management** with customer details
- **Service Management** with pricing
- **Revenue Tracking** and analytics
- **Customer Notifications** system

## 📱 User Guide

### 1. Registration & Login
- Click "User Sign In" on landing page
- Register with name, email, password
- Optional: Upload profile photo
- Auto-login after registration

### 2. Enable Location
- Click "📍 Enable Location" button
- Allow browser location access
- Or enter city name in search bar
- IP-based fallback if GPS unavailable

### 3. Browse Businesses
- View businesses on map and in grid
- Filter by type using category buttons
- See distance from your location
- Click heart to add to favorites

### 4. Book an Appointment
1. Click "📅 Book Now" on any business card
2. Select a service from the list
3. Choose a date (future dates only)
4. Pick a time slot (9 AM - 6 PM)
5. Review booking summary
6. Click "Confirm Booking"

### 5. Get Directions
- Click compass button (🧭) on business card
- Route appears on map in purple
- See distance and estimated time
- Green marker shows destination

### 6. Mobile Navigation
- **Bottom Bar**: Discover, Notifications, Favorites
- **Hamburger Menu**: Settings, Photo, Logout, Delete Account
- **Swipe-friendly** interface

## 💼 Business Guide

### 1. Business Registration
1. Click "Business Portal" on landing page
2. Fill in business details:
   - Business name and owner name
   - Email and phone
   - Business type
   - Full address
   - **Latitude and Longitude** (required for map)
   - Website (optional)
   - Verification document (optional)
   - Password

3. Submit registration
4. Auto-verified for demo purposes

### 2. Getting Coordinates
To find your business coordinates:
- Go to [Google Maps](https://maps.google.com)
- Search for your address
- Right-click on the location
- Click on the coordinates to copy
- Paste in registration form

Or use online tools:
- [LatLong.net](https://www.latlong.net/)
- [GPS Coordinates](https://gps-coordinates.org/)

### 3. Business Login
- Use registered email and password
- Auto-redirect to dashboard
- View your location on map

### 4. Dashboard Features

#### Statistics Cards
- **Total Bookings**: All-time booking count
- **Pending**: Awaiting confirmation
- **Confirmed**: Accepted bookings
- **Total Revenue**: Earnings from confirmed/completed bookings

#### Map Display
- Your business location (violet marker)
- 5km service area circle
- Address and coordinates
- Interactive zoom and pan

#### Bookings Management
- View all customer bookings
- Customer name and contact
- Service and price details
- Date and time
- Status badges with colors:
  - 🟡 Pending (orange)
  - 🟢 Confirmed (green)
  - 🔵 Completed (blue)
  - 🔴 Cancelled (red)

#### Services
- View all your services
- Add new services (click "➕ Add Service")
- Edit pricing

## 🎨 Design Features

### Color Palette
- **Primary Purple**: #8B5CF6 - Main actions, headers
- **Primary Pink**: #EC4899 - Accents, favorites
- **Teal**: #14B8A6 - Booking actions, success
- **Orange**: #F59E0B - Warnings, directions
- **Cyan**: #06B6D4 - Info, highlights

### UI Elements
- **Glass-morphism**: Frosted glass effect on cards
- **Gradients**: Smooth color transitions
- **Shadows**: Depth and elevation
- **Animations**: Smooth transitions and hover effects
- **Responsive**: Mobile-first design

## 🗺️ Map Features

### User Location
- Red marker: Your current location
- Auto-detect on page load
- Manual refresh available

### Business Locations
- Blue markers: All businesses
- Click for business info popup
- Distance shown in km or meters

### Directions
- Purple route line
- Green destination marker
- Distance and time estimate
- Powered by OSRM (Open Source Routing Machine)

## 📊 Sample Data

### Test Users
Create your own or use sample businesses:
- **Email**: Any business email from sample data
- **Password**: `password` (for all sample accounts)

### Sample Businesses
20+ businesses across Canada:
- Toronto, ON
- Vancouver, BC
- Montreal, QC
- Calgary, AB
- Ottawa, ON
- And more...

## 🔧 Technical Details

### Frontend
- **HTML5**: Semantic markup
- **CSS3**: Modern styling with variables
- **JavaScript**: Vanilla JS, no frameworks
- **Leaflet.js**: Interactive maps
- **OpenStreetMap**: Map tiles

### Backend
- **Python 3**: Flask framework
- **SQLite**: Database
- **RESTful API**: JSON responses
- **CORS**: Cross-origin support

### APIs Used
- **OSRM**: Routing and directions
- **Nominatim**: Geocoding (address to coordinates)
- **ipapi.co**: IP-based geolocation fallback

## 📁 Project Structure

```
bb10/
├── backend/
│   ├── app.py              # Main Flask application
│   └── database.py         # Database schema and initialization
├── static/
│   ├── css/
│   │   └── style.css       # All styles
│   ├── js/
│   │   ├── app.js          # User app logic
│   │   └── business-dashboard.js  # Business dashboard logic
│   ├── index.html          # Main user interface
│   └── business-dashboard.html    # Business dashboard
├── uploads/                # User and business uploads
├── database.db            # SQLite database
├── requirements.txt       # Python dependencies
└── UPDATE_SUMMARY.md     # Feature documentation
```

## 🐛 Troubleshooting

### Location Not Working
1. Check browser permissions
2. Enable location services on device
3. Try IP-based detection (automatic fallback)
4. Manually search for your city

### Map Not Loading
1. Check internet connection
2. Refresh the page
3. Clear browser cache
4. Try different browser

### Bookings Not Saving
1. Ensure you're logged in
2. Check all fields are filled
3. Check browser console for errors
4. Verify database is initialized

### Business Dashboard Not Loading
1. Ensure you logged in as business
2. Check localStorage has business data
3. Verify business has coordinates
4. Refresh the page

## 🚀 Deployment

### Local Development
```bash
python backend/app.py
# Server runs on http://localhost:5000
```

### Production (Heroku)
See `DEPLOYMENT.md` for detailed instructions

### Environment Variables
```
DATABASE_PATH=./database.db
UPLOAD_FOLDER=./uploads
MAX_FILE_SIZE=5242880  # 5MB
```

## 📝 API Endpoints

### User Endpoints
- `POST /api/user/register` - Register new user
- `POST /api/user/login` - User login
- `POST /api/user/upload-photo` - Upload profile photo
- `GET /api/user/<id>/bookings` - Get user bookings
- `GET /api/user/<id>/favorites` - Get favorites
- `POST /api/user/<id>/favorites/<business_id>` - Add favorite
- `DELETE /api/user/<id>/favorites/<business_id>` - Remove favorite

### Business Endpoints
- `POST /api/business/register` - Register business
- `POST /api/business/login` - Business login
- `GET /api/business/<id>/stats` - Get statistics
- `GET /api/business/<id>/bookings` - Get bookings
- `GET /api/business/<id>/services` - Get services
- `GET /api/business/<id>/notifications` - Get notifications

### Booking Endpoints
- `POST /api/bookings/create` - Create booking
- `POST /api/bookings/<id>/status` - Update status

### Search Endpoints
- `POST /api/businesses/nearby` - Search nearby businesses
- `GET /api/businesses/search?q=<query>` - Search by name

## 🎓 Learning Resources

### Technologies Used
- [Flask Documentation](https://flask.palletsprojects.com/)
- [Leaflet.js Guide](https://leafletjs.com/)
- [SQLite Tutorial](https://www.sqlitetutorial.net/)
- [MDN Web Docs](https://developer.mozilla.org/)

## 📄 License

This project is for educational purposes.

## 🤝 Support

For issues or questions:
1. Check this README
2. Review UPDATE_SUMMARY.md
3. Check browser console for errors
4. Verify database is initialized

## 🎉 Enjoy BOOK&BLOOM!

Start discovering and booking beauty services near you! 💅✨
