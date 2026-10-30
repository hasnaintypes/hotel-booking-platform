import { Controller, Get, Header } from "@nestjs/common";

@Controller()
export class AppController {
  @Get()
  @Header("Content-Type", "text/html")
  root() {
    return "<h1>Hotel Booking Backend API is running</h1>";
  }
}
