<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://coveralls.io/github/nestjs/nest?branch=master" target="_blank"><img src="https://coveralls.io/repos/github/nestjs/nest/badge.svg?branch=master#9" alt="Coverage" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

# WhatsApp Simulator

A NestJS application that simulates WhatsApp Web functionality, allowing you to send messages, files, and images programmatically.

## Description

This application provides an API for interacting with WhatsApp Web, enabling you to build custom integrations or automated messaging solutions.

## Features

- Initialize and manage WhatsApp sessions
- Send text messages
- Send files and images
- Get group lists and search groups
- Retrieve group messages with media support
- API Key authentication for secure access
- Temporary file storage (files are deleted after sending)
- Temporary media URLs for retrieved messages (expires in 1 hour)

## Installation

```bash
$ npm install
```

## Environment Variables

Create a `.env` file in the root directory with the following variables:

```
PORT=3000
API_KEY=your_secure_api_key
```

If `API_KEY` is not set, the API will be accessible without authentication.

## Running the app

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

## API Documentation

All endpoints support API key authentication via the `apiKey` query parameter if `API_KEY` is configured in the .env file.

Example: `GET /whatsapp/1/status?apiKey=your_secure_api_key`

### Session Management

- `POST /whatsapp/:userId/init` - Initialize a WhatsApp session
- `GET /whatsapp/:userId/reinitialize` - Reinitialize a session
- `GET /whatsapp/:userId/status` - Get session status
- `POST /whatsapp/:userId/stop` - Stop a session
- `POST /whatsapp/:userId/restart` - Restart a session
- `DELETE /whatsapp/:userId/delete` - Delete a session

### Messaging

- `POST /whatsapp/:userId/send` - Send a text message
  ```json
  {
    "to": "1234567890@c.us",
    "message": "Hello, world!"
  }
  ```

### File and Image Handling

- `POST /whatsapp/:userId/send-file` - Upload and send a file in one step (multipart/form-data)
  - Form fields:
    - `file`: The file to upload and send
    - `to`: The recipient's phone number (format: 1234567890@c.us)
    - `caption`: (Optional) A caption for the file

- `POST /whatsapp/:userId/send-image` - Upload and send an image in one step (multipart/form-data)
  - Form fields:
    - `file`: The image to upload and send (supported formats: jpg, jpeg, png, gif, webp)
    - `to`: The recipient's phone number (format: 1234567890@c.us)
    - `caption`: (Optional) A caption for the image

### Group Management

- `GET /whatsapp/:userId/groups` - Get all groups for the user
  - Query Parameters:
    - `query` (optional): Search groups by name

- `GET /whatsapp/:userId/groups/:groupId/messages` - Get messages from a specific group
  - Path Parameters:
    - `groupId`: The group ID (can be with or without @g.us suffix)
  - Query Parameters:
    - `sen` (optional): Filter messages by sender ID
    - `limit` (optional): Number of messages to retrieve (default: 10)
    - `includeMedia` (optional): Include all media types (true/false)
    - `includeImages` (optional): Include image URLs (true/false)
    - `includeVideos` (optional): Include video URLs (true/false)
    - `includeAudio` (optional): Include audio/voice URLs (true/false)

  **Response Format:**
  ```json
  [
    {
      "id": "message_id",
      "body": "message text",
      "sender": "sender_phone@c.us",
      "timestamp": 1234567890,
      "type": "chat",
      "media": null
    },
    {
      "id": "message_id_2",
      "body": "",
      "sender": "sender_phone@c.us", 
      "timestamp": 1234567891,
      "type": "image",
      "media": {
        "hasMedia": true,
        "type": "image",
        "url": "http://localhost:3000/whatsapp/media/images/uuid.jpg",
        "mimeType": "image/jpeg",
        "filename": null
      }
    }
  ]
  ```

- `GET /whatsapp/media/:type/:filename` - Serve temporary media files
  - Path Parameters:
    - `type`: Media type (images/files)
    - `filename`: The filename to retrieve
  
  **Note**: Media files are temporary and automatically deleted after 1 hour.

**Note**: Files and images are automatically deleted after being sent to save storage space.

## Run tests

```bash
# unit tests
$ npm run test

# e2e tests
$ npm run test:e2e

# test coverage
$ npm run test:cov
```

## Deployment

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ npm install -g mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

This project is [MIT licensed](LICENSE).
