import { Injectable } from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class UsersService {
  private dbPath = path.join(__dirname, 'data', 'db.json');

  private readDb() {
    try {
      const data = fs.readFileSync(this.dbPath, 'utf8');
      return JSON.parse(data);
    } catch (err) {
      if (err.code === 'ENOENT') {
        this.writeDb({ users: [] });
        return { users: [] };
      }
      throw err;
    }
  }

  private writeDb(data: any) {
    fs.mkdirSync(path.dirname(this.dbPath), { recursive: true });
    fs.writeFileSync(this.dbPath, JSON.stringify(data, null, 2));
  }

  create(createUserDto: CreateUserDto) {
    const db = this.readDb();
    const newUser = {
      id: Math.floor(Math.random() * 100000000) + 1,
      name: createUserDto.name
    };
    db.users.push(newUser);
    this.writeDb(db);
    return newUser;
  }

  findAll() {
    const db = this.readDb();
    return db.users;
  }

  findOne(id: number) {
    const db = this.readDb();
    return db.users.find(user => user.id === id);
  }

  update(id: number, updateUserDto: UpdateUserDto) {
    const db = this.readDb();
    const userIndex = db.users.findIndex(user => user.id === id);
    if (userIndex > -1) {
      db.users[userIndex] = { ...db.users[userIndex], ...updateUserDto };
      this.writeDb(db);
      return db.users[userIndex];
    }
    return null;
  }

  remove(id: number) {
    const db = this.readDb();
    const userIndex = db.users.findIndex(user => user.id === id);
    if (userIndex > -1) {
      const [removedUser] = db.users.splice(userIndex, 1);
      this.writeDb(db);
      return removedUser;
    }
    return null;
  }
}
