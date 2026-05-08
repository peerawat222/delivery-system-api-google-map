-- Database creation
CREATE DATABASE IF NOT EXISTS logis_db
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_general_ci;

USE logis_db;

-- Drop existing tables (child-first)
DROP TABLE IF EXISTS order_events;
DROP TABLE IF EXISTS payments;
DROP TABLE IF EXISTS orders;
DROP TABLE IF EXISTS rider_profiles;
DROP TABLE IF EXISTS users;

-- Users
CREATE TABLE users (
  user_id INT AUTO_INCREMENT PRIMARY KEY,
  full_name VARCHAR(100) NOT NULL,
  phone VARCHAR(20) NULL,
  email VARCHAR(100) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('customer','rider','admin') NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Rider profiles
CREATE TABLE rider_profiles (
  rider_id INT NOT NULL PRIMARY KEY,
  vehicle_type VARCHAR(50),
  plate_number VARCHAR(50),
  status ENUM('available','busy','inactive') DEFAULT 'available',
  FOREIGN KEY (rider_id) REFERENCES users(user_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Orders
CREATE TABLE orders (
  order_id INT AUTO_INCREMENT PRIMARY KEY,

  customer_id INT NOT NULL,
  rider_id INT NULL,

  receiver_name VARCHAR(100) NOT NULL,
  receiver_phone VARCHAR(20) NOT NULL,

  pickup_address VARCHAR(255) NOT NULL,
  pickup_lat DECIMAL(10,7),
  pickup_lng DECIMAL(10,7),

  dropoff_address VARCHAR(255) NOT NULL,
  dropoff_lat DECIMAL(10,7),
  dropoff_lng DECIMAL(10,7),

  product_type VARCHAR(120),
  parcel_desc VARCHAR(255),
  rider_note TEXT,
  weight_kg DECIMAL(10,2),

  distance_km DECIMAL(10,2),
  base_fare DECIMAL(10,2),
  shipping_fee DECIMAL(10,2),
  total_price DECIMAL(10,2),

  payment_method ENUM('COD','QR','TRANSFER') DEFAULT 'COD',
  payment_status ENUM('pending','paid','failed') DEFAULT 'pending',

  status ENUM(
    'created',
    'waiting_rider',
    'assigned',
    'picking_up',
    'delivering',
    'completed',
    'cancelled'
  ) DEFAULT 'created',

  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  FOREIGN KEY (customer_id) REFERENCES users(user_id),
  FOREIGN KEY (rider_id) REFERENCES users(user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Payments
CREATE TABLE payments (
  payment_id INT AUTO_INCREMENT PRIMARY KEY,
  order_id INT NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  payment_method ENUM('COD','QR','TRANSFER') NOT NULL,
  status ENUM('pending','paid','failed') DEFAULT 'pending',
  paid_at DATETIME NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (order_id) REFERENCES orders(order_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Order events
CREATE TABLE order_events (
  event_id INT AUTO_INCREMENT PRIMARY KEY,
  order_id INT NOT NULL,
  status VARCHAR(50) NOT NULL,
  description VARCHAR(255),
  event_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (order_id) REFERENCES orders(order_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
