import { sql } from "drizzle-orm";
import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const travelers = sqliteTable("travelers", {
  id: text("id").primaryKey(),
  destinationId: text("destination_id").notNull().default("ishigaki-2026"),
  name: text("name").notNull(),
  gender: text("gender").notNull().default("unspecified"),
  flightStatus: text("flight_status").notNull().default("confirmed"),
  flightNote: text("flight_note").notNull().default(""),
  hotelStatus: text("hotel_status").notNull().default("vessel"),
  hotelNote: text("hotel_note").notNull().default(""),
  diveDays: text("dive_days").notNull().default("[]"),
  certification: text("certification").notNull().default("미정"),
  gearRental: text("gear_rental").notNull().default("none"),
  note: text("note").notNull().default(""),
  sortOrder: integer("sort_order").notNull().default(0),
  editPinHash: text("edit_pin_hash").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const destinations = sqliteTable("destinations", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  region: text("region").notNull().default(""),
  country: text("country").notNull().default("일본"),
  countryCode: text("country_code").notNull().default("jp"),
  latitude: real("latitude").notNull(),
  longitude: real("longitude").notNull(),
  month: text("month").notNull().default("TBD"),
  year: text("year").notNull().default("2026"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const tripItems = sqliteTable("trip_items", {
  id: text("id").primaryKey(),
  destinationId: text("destination_id").notNull().references(() => destinations.id, { onDelete: "cascade" }),
  category: text("category").notNull().default("activity"),
  date: text("date").notNull().default(""),
  time: text("time").notNull().default(""),
  title: text("title").notNull(),
  location: text("location").notNull().default(""),
  note: text("note").notNull().default(""),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const notices = sqliteTable("notices", {
  id: text("id").primaryKey(),
  destinationId: text("destination_id"),
  title: text("title").notNull(),
  content: text("content").notNull().default(""),
  startAt: text("start_at").notNull().default(""),
  endAt: text("end_at").notNull().default(""),
  isPopup: integer("is_popup").notNull().default(1),
  isImportant: integer("is_important").notNull().default(0),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const diveLogs = sqliteTable("dive_logs", {
  id: text("id").primaryKey(),
  destinationId: text("destination_id").notNull().references(() => destinations.id, { onDelete: "cascade" }),
  date: text("date").notNull().default(""),
  startTime: text("start_time").notNull().default(""),
  diveNumber: integer("dive_number").notNull().default(1),
  pointName: text("point_name").notNull(),
  latitude: real("latitude"),
  longitude: real("longitude"),
  maxDepth: real("max_depth"),
  durationMinutes: integer("duration_minutes"),
  waterTemperature: real("water_temperature"),
  visibility: real("visibility"),
  entryType: text("entry_type").notNull().default("boat"),
  currentStrength: text("current_strength").notNull().default("calm"),
  buddies: text("buddies").notNull().default(""),
  creatures: text("creatures").notNull().default(""),
  note: text("note").notNull().default(""),
  photoUrls: text("photo_urls").notNull().default("[]"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const appendixFiles = sqliteTable("appendix_files", {
  id: text("id").primaryKey(),
  destinationId: text("destination_id").notNull().references(() => destinations.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  contributor: text("contributor").notNull().default(""),
  originalName: text("original_name").notNull(),
  contentType: text("content_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  r2Key: text("r2_key").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
