-- Schema for logis_db (users, rider_profiles, orders, payments, order_events)

CREATE DATABASE IF NOT EXISTS `logis_db` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `logis_db`;

CREATE TABLE IF NOT EXISTS `users` (
  `user_id` INT NOT NULL AUTO_INCREMENT,
  `full_name` VARCHAR(100) NOT NULL,
  `phone` VARCHAR(20) DEFAULT NULL,
  `email` VARCHAR(100) NOT NULL UNIQUE,
  `password_hash` VARCHAR(255) NOT NULL,
  `role` ENUM('customer', 'rider', 'admin') NOT NULL DEFAULT 'customer',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `rider_profiles` (
  `rider_id` INT NOT NULL,
  `vehicle_type` VARCHAR(50) DEFAULT NULL,
  `plate_number` VARCHAR(50) DEFAULT NULL,
  `status` ENUM('available', 'busy', 'inactive') NOT NULL DEFAULT 'available',
  PRIMARY KEY (`rider_id`),
  CONSTRAINT `fk_rider_user` FOREIGN KEY (`rider_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `orders` (
  `order_id` INT NOT NULL AUTO_INCREMENT,
  `customer_id` INT NOT NULL,
  `rider_id` INT DEFAULT NULL,
  `vehicle_type` VARCHAR(50) DEFAULT NULL,
  `total_price` DECIMAL(10,2) DEFAULT NULL,
  `payment_method` ENUM('COD', 'QR', 'TRANSFER') DEFAULT NULL,
  `payment_status` ENUM('pending', 'paid', 'failed') NOT NULL DEFAULT 'pending',
  `status` ENUM('created', 'waiting_rider', 'assigned', 'picking_up', 'delivering', 'completed', 'cancelled') NOT NULL DEFAULT 'created',
  `service_type` ENUM('passenger', 'parcel') NOT NULL DEFAULT 'parcel',
  `receiver_name` VARCHAR(100) DEFAULT NULL,
  `receiver_phone` VARCHAR(20) DEFAULT NULL,
  `pickup_address` VARCHAR(255) DEFAULT NULL,
  `pickup_lat` DECIMAL(10,7) DEFAULT NULL,
  `pickup_lng` DECIMAL(10,7) DEFAULT NULL,
  `dropoff_address` VARCHAR(255) DEFAULT NULL,
  `dropoff_lat` DECIMAL(10,7) DEFAULT NULL,
  `dropoff_lng` DECIMAL(10,7) DEFAULT NULL,
  `distance_km` DECIMAL(10,2) DEFAULT NULL,
  `commission_rate` DECIMAL(5,4) NOT NULL DEFAULT 0.2000,
  `scheduled_at` DATETIME DEFAULT NULL,
  `scheduled_text` VARCHAR(100) DEFAULT NULL,
  `paid_at` DATETIME DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`order_id`),
  KEY `idx_orders_customer` (`customer_id`),
  KEY `idx_orders_rider` (`rider_id`),
  KEY `idx_orders_status` (`status`),
  CONSTRAINT `fk_orders_customer` FOREIGN KEY (`customer_id`) REFERENCES `users` (`user_id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_orders_rider` FOREIGN KEY (`rider_id`) REFERENCES `users` (`user_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `product` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `order_id` INT NOT NULL,
  `quantity` INT NOT NULL DEFAULT 1,
  `price` DECIMAL(10,2) NOT NULL DEFAULT 0,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_product_order` (`order_id`),
  CONSTRAINT `fk_product_order` FOREIGN KEY (`order_id`) REFERENCES `orders` (`order_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `product_details` (
  `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `product_id` INT NOT NULL,
  `product_name` VARCHAR(255) NULL,
  `weight_kg` DECIMAL(10,2) NULL,
  `notes` TEXT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `uq_product_details_product` (`product_id`),
  CONSTRAINT `fk_product_details_item` FOREIGN KEY (`product_id`) REFERENCES `product` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `payments` (
  `payment_id` INT NOT NULL AUTO_INCREMENT,
  `order_id` INT NOT NULL,
  `amount` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `payment_method` ENUM('COD', 'QR', 'TRANSFER') NOT NULL,
  `status` ENUM('pending', 'paid', 'failed') NOT NULL DEFAULT 'pending',
  `paid_at` DATETIME DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`payment_id`),
  KEY `idx_payments_order` (`order_id`),
  CONSTRAINT `fk_payments_order` FOREIGN KEY (`order_id`) REFERENCES `orders` (`order_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `order_events` (
  `event_id` INT NOT NULL AUTO_INCREMENT,
  `order_id` INT NOT NULL,
  `actor_id` INT NULL,
  `actor_role` VARCHAR(50) NULL,
  `event_type` VARCHAR(100) NOT NULL,
  `message` TEXT DEFAULT NULL,
  `meta` JSON DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`event_id`),
  KEY `idx_order_events_order` (`order_id`),
  CONSTRAINT `fk_order_events_order` FOREIGN KEY (`order_id`) REFERENCES `orders` (`order_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
