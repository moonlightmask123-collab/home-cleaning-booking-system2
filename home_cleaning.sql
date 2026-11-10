-- Optional: the server creates these tables automatically on first start.
-- Run this file yourself only if you prefer to set the database up by hand.
CREATE DATABASE IF NOT EXISTS home_cleaning;
USE home_cleaning;

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(100) NOT NULL UNIQUE,
  phone VARCHAR(15) NOT NULL,
  password VARCHAR(255) NOT NULL,
  address VARCHAR(255) NOT NULL
);

CREATE TABLE IF NOT EXISTS bookings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  service VARCHAR(100) NOT NULL,
  price INT NOT NULL DEFAULT 0,
  booking_date DATE NOT NULL,
  time_slot VARCHAR(50) NOT NULL,
  address VARCHAR(255) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'Confirmed',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_slot (booking_date, time_slot, status),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
